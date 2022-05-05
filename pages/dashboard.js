import Head from 'next/head'
import Image from 'next/image'
import styles from '../styles/Home.module.css'
import Footer from "./components/Footer/footer.js";
import Header from "./components/Header/header.js"
import { Table, Icon, Modal, Button, Input} from "semantic-ui-react"
import React from "react"
import ActiveLink from './components/ActiveLink';
import { useRouter } from 'next/router'

export default function Home() {
  const [open, setOpen] = React.useState(false)

  return (
    <div>
      <Head>
        <title>Dashboard | NDS</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/logo.svg" />
      </Head>
      <main>
        <Header />
        <div className='main' style={{width: "900px"}}>
          <h2>Deployments</h2>
          <DeploymentList />
          <NewDeploymentModal open={open} setOpen={setOpen}/>
        </div>
      </main>
      <Footer />
    </div>
  )
}

function DeploymentList() {
  const router = useRouter()
  var [deployments, setDeployments] = React.useState([{
    id: "null",
    name: <Icon name="circle notched" loading/>,
    status: <Icon name="circle notched" loading/>,
    internalPort: <Icon name="circle notched" loading/>,
    externalPort: <Icon name="circle notched" loading/>,
    memory: <Icon name="circle notched" loading/>,
    runCmd: <Icon name="circle notched" loading/>,
    nodeVersion: <Icon name="circle notched" loading/>
  }]);
  if (deployments && deployments[0] && deployments[0].id === "null") {
    getDeployments();
  }
  if (!deployments) deployments = []
  return (
    <Table celled striped selectable>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Name</Table.HeaderCell>
          <Table.HeaderCell>Status</Table.HeaderCell>
          <Table.HeaderCell>Port Mapping</Table.HeaderCell>
          <Table.HeaderCell>Assigned Memory</Table.HeaderCell>
          <Table.HeaderCell>Start Command</Table.HeaderCell>
          <Table.HeaderCell>Node Version</Table.HeaderCell>
        </Table.Row>
      </Table.Header>

      <Table.Body>
        {
          deployments.map((deployment, key) => {
            return (
              <Table.Row positive={deployment.status === "running"} error={deployment.status === "failed to start"} warning={deployment.status === "waiting for initialization"} key={key} onClick={() => {router.push("/deployment/"+deployment.id)}} style={{cursor: "pointer"}}>
                <Table.Cell>{deployment.name}</Table.Cell>
                <Table.Cell>{deployment.status}</Table.Cell>
                <Table.Cell>Internal: {deployment.internalPort} | External: {deployment.externalPort}</Table.Cell>
                <Table.Cell>{deployment.memory} MB</Table.Cell>
                <Table.Cell>{deployment.fullRunCommand}</Table.Cell>
                <Table.Cell>{deployment.nodeVersion}</Table.Cell>
              </Table.Row>
            )
          })
        }
      </Table.Body>
    </Table>
  )
  async function getDeployments(){
    const response = await fetch(`/api/deployments?auth=${getCachedAuth()}&action=getDeployments`);
    const data = await response.json();
    for (let i in data.data) {
      if (data.data[i].portMappings[0]) {
        data.data[i].internalPort = data.data[i].portMappings[0].split(":")[1]
        data.data[i].externalPort = data.data[i].portMappings[0].split(":")[0]
      } else {
        data.data[i].internalPort = "N/A"
        data.data[i].externalPort = "N/A"
      }
    }
    setDeployments(data.data);
  }
}
function NewDeploymentModal(props) {
  var name = "";
  var internalPort = 0;
  var externalPort = 0;
  var memory = 0;
  return (
    <Modal
      onClose={() => props.setOpen(false)}
      onOpen={() => props.setOpen(true)}
      open={props.open}
      trigger={<Button primary>New Deployment</Button>}
    >
      <Modal.Header>New Deployment <span style={{fontWeight: "normal", fontSize: "0.7em", marginLeft: "20px"}}>Configure settings here, upload code later by updating the deployment</span></Modal.Header>
      <Modal.Content>
        <Modal.Description style={{color: "black"}}>
          <h5>Name</h5>
          <Input placeholder='Name' onChange={(e, d) => name=d.value}/>
          <br/>
          <h5>Port mapping</h5>
          <Input placeholder='Internal port' type='number' onChange={(e, d) => internalPort=d.value}/>
          <Input placeholder='External port' type='number' onChange={(e, d) => externalPort=d.value}/>
          <h5>Resources</h5>
          <Input placeholder='Memory (MB)' type='number' onChange={(e, d) => memory=d.value}/>
        </Modal.Description>
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={() => props.setOpen(false)}>Cancel</Button>
        <Button onClick={createDeployment} positive>
          Create!
        </Button>
      </Modal.Actions>
    </Modal>
  )

  async function createDeployment(){
    var response = await fetch(`/api/deployments?auth=${getCachedAuth()}&action=createDeployment&name=${name}&internalPort=${internalPort}&externalPort=${externalPort}&memory=${memory}`);
    response = await response.json();
    if (response.error) {
      alert(response.error);
    } else {
      alert("Successfully created deployment! You must initialize this deployment by uploading code to it and deploying.");
      window.location.reload();
    }
  }
}


function getCachedAuth() {
  if (typeof sessionStorage !== "undefined") {
      if (sessionStorage.getItem("auth")) {
          return sessionStorage.getItem("auth")
      } else {
          return localStorage.getItem("auth")
      }
  }
}