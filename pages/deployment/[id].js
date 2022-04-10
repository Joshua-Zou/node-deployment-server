import Head from 'next/head'
import Image from 'next/image'
import Footer from "../components/Footer/footer.js";
import Header from "../components/Header/header.js"
import { Icon, Table, Button, Input, Dropdown, Segment, Radio } from 'semantic-ui-react'
import { useState, useEffect, useRef } from 'react';
import SignInModal from "../components/SignInModal/signInModal.js";
import React from "react"
import { useRouter } from "next/router"
import styles from "../../styles/deployment.module.css"
import Ansi from "ansi-to-react";
import unescapejs from "unescape-js"

var id = ""

export default function Deployment(props) {

    const router = useRouter()
    id = router.query.id
    const [deployment, setDeployment] = useState({})
    if (id && deployment && !deployment.id) {
        getDeploymentInformation(id).then(data => {
            setDeployment(data)
        })
    }
    const [tabIndex, setTabIndex] = useState(0)
    const tabs = [<Explore key="0" />, <Deploy key="1" />, <Console key="2" />, <Settings key="3" />];
    const tabNames = ["Explore", "Deploy", "Console", "Settings"]
    return (
        <div>
            <Head>
                <title>{deployment.name} Deployment | NDS</title>
                <meta name="description" content="Generated by create next app" />
                <link rel="icon" href="/logo.svg" />
            </Head>
            <main>
                <Header />
                <div className='main'>
                    <div>
                        <h2>{deployment.name} | <span style={{ fontSize: "0.75em", fontWeight: "normal" }}>{deployment.status}</span></h2>
                    </div>
                    <div className={styles.header}>
                        {
                            tabNames.map((name, index) => {
                                if (tabIndex === index) {
                                    return (
                                        <span key={index} onClick={() => { setTabIndex(index); }} className={styles.onpage}>{name}</span>
                                    )
                                } else {
                                    return (
                                        <span key={index} onClick={() => { setTabIndex(index); }}>{name}</span>
                                    )
                                }
                            })
                        }
                    </div>
                    <div style={{ marginTop: "20px" }}>
                        {tabs[tabIndex]}
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    )
}


function Explore() {
    const [files, setFiles] = useState([{
        name: <Icon loading name="circle notched" />,
        loading: true
    }]);
    const [path, setPath] = useState("/");
    if (files[0] && files[0].loading) {
        getFiles()
    }
    return (
        <div>
            <h3>Explore Deployment Files</h3>
            <span>These files do not reflect changes that your deployment made.</span>
            <Table celled striped selectable>
                <Table.Header>
                    <Table.Row>
                        <Table.HeaderCell colSpan='3'>{path}
                            <Icon name="level up" onClick={moveUp} style={{ float: "right", cursor: "pointer" }} />
                        </Table.HeaderCell>
                    </Table.Row>
                </Table.Header>

                <Table.Body>
                    {
                        files.map((file, index) => {
                            let icon = "file outline";
                            let onclick = function () {
                                window.open("/api/deployments?auth=" + getCachedAuth() + "&action=getFile&id=" + id + "&path=" + path + "/" + file.name)
                            }
                            if (file.isDirectory) {
                                icon = "folder"
                                onclick = function () {
                                    moveDown(file.name)
                                }
                                file.size = "~"
                            } else {
                                file.size = normalizeBytes(file.size)
                            }
                            let date = new Date(file.birthtime)
                            return (
                                <Table.Row key={index} onClick={onclick} className={styles.exploreRow}>
                                    <Table.Cell>
                                        <Icon name={icon} /> {file.name}
                                    </Table.Cell>
                                    <Table.Cell>{file.size}</Table.Cell>
                                    <Table.Cell textAlign='right'>{date.toDateString()}</Table.Cell>
                                </Table.Row>
                            )
                        })
                    }
                </Table.Body>
            </Table>
        </div>
    )
    function moveUp() {
        var newPath = path.split("/").slice(0, -1).join("/")
        if (newPath === "") newPath = "/"
        setPath(newPath)
        setFiles([{
            name: <Icon loading name="circle notched" />,
            loading: true
        }])
    }
    function moveDown(file) {
        if (path.endsWith("/")) {
            setPath(path + file)
        } else {
            setPath(path + "/" + file)
        }
        setFiles([{
            name: <Icon loading name="circle notched" />,
            loading: true
        }])
    }
    function getFiles() {
        if (!id) {
            setTimeout(function () {
                getFiles()
            }, 1000)
            return;
        }
        fetch(`/api/deployments?auth=${getCachedAuth()}&action=getFiles&id=${id}&path=${path}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    setFiles([{
                        name: data.error,
                        loading: false
                    }])
                } else {
                    setFiles(data.data)
                }
            })
    }
}

function Deploy() {
    const [DButton, setDButton] = useState(() => {
        return (
            <div>
                <span>Deployment is already in the process of updating and redeploying!</span><br></br><br></br>
                <Button animated='vertical' primary disabled>
                    <Button.Content hidden><Icon name='rocket' /></Button.Content>
                    <Button.Content visible>
                        Deploy
                    </Button.Content>
                </Button>
            </div>
        )
    })
    const [consoleVisible, setConsoleVisible] = useState(false)
    const [dconsole, setConsole] = useState(["Loading..."]);
    const [queried, setQueried] = useState(false)
    var evtSource = useRef(null);
    useEffect(() => {
        return () => {
            if (evtSource.current !== null) {
                evtSource.current.close();
            }
        }
    }, [])
    function newLog(log) {
        log = unescapejs(log)
        setConsole(dconsole => [...dconsole, log]);
    }
    if (!queried) {
        getDeploymentInformation(id).then(data => {
            setQueried(true)
            if (data.status !== "building") {
                setDButton(() => {
                    return (
                        <div>
                            <Button animated='vertical' primary onClick={initDeploy}>
                                <Button.Content hidden><Icon name='rocket' /></Button.Content>
                                <Button.Content visible>
                                    Deploy
                                </Button.Content>
                            </Button>
                        </div>
                    )
                })
            } else {
                evtSource.current = new EventSource('/api/deployment/buildLog?auth=' + getCachedAuth() + "&id=" + id);
                evtSource.current.onmessage = function (e) {
                    newLog(e.data)
                }
                setDButton()
                setConsoleVisible(true);
            }
        })
    }
    return (
        <div>
            <h2>Upload zip file </h2>
            <form action={`/api/deployments?auth=${getCachedAuth()}&id=${id}&action=uploadDeployment`} method="POST" encType="multipart/form-data">
                <Input type="file" name="zip" accept=".zip" />
                <Input type="hidden" name="auth" value={getCachedAuth()}></Input>
                <Input type="hidden" name="id" value={id}></Input>
                <Input type="hidden" name="action" value="uploadDeployment"></Input>
                <Button type="submit" content="Upload" primary style={{ height: "44px", width: "100px", marginLeft: "10px" }} />
            </form>
            <h3>Deploy</h3>
            {DButton}
            <DeployConsole visible={consoleVisible} logs={dconsole} text="Build & Deployment Logs" />
        </div>
    )
    async function initDeploy() {
        console.log("Starting Deploy");
        evtSource.current = new EventSource('/api/deployment/buildLog?auth=' + getCachedAuth() + "&id=" + id);
        evtSource.current.onmessage = function (e) {
            console.log(e.data)
            newLog(e.data)
        }
        let results = await fetch(`/api/deployment/deploy?auth=${getCachedAuth()}&id=${id}`, {
            method: "POST"
        });
        results = await results.json();
        if (results.error) return alert(results.error);
        setDButton()
        setConsoleVisible(true);
    }
}
class DeployConsole extends React.Component {
    constructor(props) {
        super(props);
        // // create a ref to store the textInput DOM element
        this.messageContainer = React.createRef();
        this.scrollToBottom = this.scrollToBottom.bind(this);
    }
    scrollToBottom = () => {
        if (!this.messageContainer.current) return;
        this.messageContainer.current.scrollTop = this.messageContainer.current.scrollHeight;

    }
    componentDidMount() {
        this.scrollToBottom();
    }

    componentDidUpdate() {
        this.scrollToBottom();
    }
    render() {
        if (this.props.visible === false) return <div></div>
        return (
            <div className={styles.deployConsole}>
                <h2>{this.props.text}</h2>
                <div className={styles.console} ref={this.messageContainer}>
                    {this.props.logs.map((log, index) => {
                        var element = <Ansi>{log}</Ansi>
                        //var element = log
                        return (
                            <span key={index}>
                                {
                                    element
                                }
                            </span>
                        )
                    })}
                </div>
            </div>
        )
    }
}
function Console() {
    const [dconsole, setConsole] = useState(["Loading..."]);
    var consoleStream = useRef(null);
    useEffect(() => {
        return () => {
            if (consoleStream.current !== null) {
                consoleStream.current.close();
            }
        }
    }, [])
    if (dconsole[dconsole.length - 1] === "Loading...") {
        initEventStream();
    }
    return (
        <DeployConsole visible={true} logs={dconsole} text="Application Logs" />
    )
    async function initEventStream() {
        let oldLogs = await fetch('/api/deployment/oldRunLogs?auth=' + getCachedAuth() + "&id=" + id)
        oldLogs = await oldLogs.json();
        if (oldLogs.data) {
            let logs = oldLogs.data.split("\n")
            logs.forEach(l => newLog(l))
        }
        consoleStream.current = new EventSource('/api/deployment/runLogs?auth=' + getCachedAuth() + "&id=" + id);
        consoleStream.current.onmessage = function (e) {
            newLog(e.data)
        }
    }
    function newLog(log) {
        log = unescapejs(log)
        log = log.replace(/[\x00-\x08\x0E-\x1F\x7F-\uFFFF]/g, '')
        log = log.replace(/\[0/g, "\u001b[0")
        console.log(log)
        setConsole(dconsole => [...dconsole, log]);
    }
}
function Settings() {
    const [deployment, setDeployment] = useState({
        name: "",
        internalPort: 0,
        externalPort: 0,
        memory: 0,
        runCmd: "",
        nodeVersion: "",
        loading: true
    });
    const [disabled, setDisabled] = useState(true);
    if (deployment.loading === true) {
        getDeploymentInformation(id).then(deployment => {
            setDeployment(deployment);
        })
        getLoginInfo().then(login => {
            if (login.permission === "admin" || login.permission === "readwrite") {
                setDisabled(false);
            }
        })
    }
    return (
        <div>
            <PortSettings deployment={deployment} disabled={disabled} />
            <Name deployment={deployment} disabled={disabled} />
            <Environment deployment={deployment} disabled={disabled} />
            <ContainerSettings deployment={deployment} disabled={disabled} />
            <DeploymentActions deployment={deployment} disabled={disabled} />
        </div>
    )
    function PortSettings(props) {
        var internalPort = props.deployment.internalPort;
        var externalPort = props.deployment.externalPort;
        return (
            <div className={styles.settingsSection}>
                <h3>Port Mappings</h3>
                <Input type="number" defaultValue={props.deployment.internalPort} placeholder="Internal Port" onChange={(e, d) => internalPort = d.value} />
                <Icon name="arrow right" style={{ marginLeft: "10px" }} />
                <Input type="number" defaultValue={props.deployment.externalPort} placeholder="External Port" onChange={(e, d) => externalPort = d.value} />
                <br></br>
                <br></br>
                <Button content="Save" primary disabled={props.disabled} onClick={async () => {
                    let results = await fetch(`/api/deployments?auth=${getCachedAuth()}&id=${id}&internalPort=${internalPort}&externalPort=${externalPort}&action=updatePort`);
                    results = await results.json();
                    if (results.error) alert(results.error);
                    else {
                        alert(results.data);
                        window.location.reload();
                    }
                }} />
            </div>
        )
    }
    function Name(props) {
        var name = props.deployment.name;
        return (
            <div className={styles.settingsSection}>
                <h3>Deployment Name</h3>
                <Input defaultValue={props.deployment.name} placeholder="Name" onChange={(e, d) => name = d.value} />
                <br></br>
                <br></br>
                <Button content="Save" primary disabled={props.disabled} onClick={async () => {
                    let results = await fetch(`/api/deployments?auth=${getCachedAuth()}&id=${id}&name=${name}&action=updateName`);
                    results = await results.json();
                    if (results.error) alert(results.error);
                    else {
                        alert(results.data);
                        window.location.reload();
                    }
                }} />
            </div>
        )
    }
    function Environment(props) {
        var memory = props.deployment.memory;
        var nodeVersion = props.deployment.nodeVersion;
        var runCmd = props.deployment.runCmd;
        return (
            <div className={styles.settingsSection}>
                <h3>Deployment Environment</h3>
                <Input defaultValue={props.deployment.memory} placeholder="Memory" onChange={(e, d) => memory = d.value} label="Memory (MB)" />
                <br></br>
                <br></br>
                <Input defaultValue={props.deployment.nodeVersion} placeholder="Node Image" onChange={(e, d) => nodeVersion = d.value} label="NodeJS Image" />
                <br></br>
                <br></br>
                <Input defaultValue={props.deployment.runCmd} placeholder="Run Command" onChange={(e, d) => runCmd = d.value} label="npm run " />
                <br></br>
                <br></br>
                <Button content="Save" primary disabled={props.disabled} onClick={async () => {
                    let results = await fetch(`/api/deployments?auth=${getCachedAuth()}&id=${id}&memory=${memory}&nodeVersion=${nodeVersion}&runCmd=${runCmd}&action=updateEnvironment`);
                    results = await results.json();
                    if (results.error) alert(results.error);
                    else {
                        alert(results.data);
                        window.location.reload();
                    }
                }} />
            </div>
        )
    }
    function ContainerSettings(props) {
        var startContainerOnStartup = props.deployment.startContainerOnStartup;
        return (
            <div className={styles.settingsSection}>
                <h3>Container Settings</h3>
                <span style={{verticalAlign: "top", fontWeight: "bold", marginRight: "10px"}}>Start Deployment on Computer Startup</span>
                <Radio toggle defaultChecked={props.deployment.startContainerOnStartup} onChange={(e, d) => startContainerOnStartup = d.checked} />
                <br></br>
                <br></br>
                <Button content="Save" primary disabled={props.disabled} onClick={async () => {
                    let results = await fetch(`/api/deployments?auth=${getCachedAuth()}&id=${id}&startContainerOnStartup=${startContainerOnStartup}&action=updateContainerSettings`);
                    results = await results.json();
                    if (results.error) alert(results.error);
                    else {
                        alert(results.data);
                        window.location.reload();
                    }
                }} />
            </div>
        )
    }
    function DeploymentActions(props) {
        const router = useRouter();
        return (
            <div>
                <Button inverted color='red' onClick={() => {
                    fetch(`/api/deployments?auth=${getCachedAuth()}&id=${id}&action=restart`).then(res => res.json()).then(json => {
                        if (json.error) alert(json.error);
                        else {
                            alert(json.data);
                            window.location.reload();
                        }
                    })
                }}>
                    Restart Deployment
                </Button>
                <Button inverted color='red' style={{ marginLeft: "15px" }} onClick={() => {
                    fetch(`/api/deployments?auth=${getCachedAuth()}&id=${id}&action=delete`).then(res => res.json()).then(json => {
                        if (json.error) alert(json.error);
                        else {
                            alert(json.data);
                            router.push("/dashboard")
                        }
                    })
                }}>
                    Delete Deployment
                </Button>
            </div>

        )
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
async function getDeploymentInformation(id) {
    const res = await fetch(`/api/deployments?auth=${getCachedAuth()}&action=getDeploymentInformation&id=${id}`);
    const data = await res.json();
    return data.data
}


function normalizeBytes(bytes) {
    if (bytes < 1024) {
        return bytes + " Bytes"
    } else if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(2) + " KB"
    } else if (bytes < 1024 * 1024 * 1024) {
        return (bytes / 1024 / 1024).toFixed(2) + " MB"
    } else {
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB"
    }
}
async function getLoginInfo() {
    const res = await fetch(`/api/user?auth=${getCachedAuth()}`);
    const data = await res.json()
    return data;
}