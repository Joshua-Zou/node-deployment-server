import Head from 'next/head'
import Image from 'next/image'
import styles from '../../styles/Admin.module.css'
import Footer from "../components/Footer/footer.js";
import Header from "../components/Header/header.js"
import { Dimmer, Loader, Segment, Button} from 'semantic-ui-react'
import { useState, useEffect } from 'react';
import SignInModal from "../components/SignInModal/signInModal.js";
import React from "react"
import dynamic from 'next/dynamic'


var currentEditorValue = "";

export default function Update() {

  return (
    <div>
      <Head>
        <title>Update | NDS</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/logo.svg" />
      </Head>
      <main>
        <Header />
        <div className='main'>
          <Main />

        </div>
      </main>
      <Footer />
    </div>
  )
}
function Main() {
  const [isUpToDate, setIsUpToDate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  useEffect(() => {
    fetch(`/api/update?auth=${getCachedAuth()}&action=getIfNeedUpdate`).then(res => res.json()).then(data => {
      setIsUpToDate(data.data);
    })
  })
  if (!isUpToDate) {
    return (
      <div>
        <h1>NDS is up to date!</h1>
      </div>
    )
  }
  return (
    <div>
      <h1>Update NDS to version {isUpToDate}</h1>
      <h3>View release notes <a href={"https://github.com/Joshua-Zou/node-deployment-server/releases/tag/v" + isUpToDate} target="_blank" rel="noreferrer">here</a></h3>
      <Button inverted color='red' onClick={async () => {
        if (!confirm("Are you sure you want to update NDS?")) return;
        setIsUpdating(true);
        const res = await fetch(`/api/update?auth=${getCachedAuth()}&action=update`);
        const data = await res.json();
        if (data.error) return alert(data.error);
        while (true) {
          try {
            console.log("Attempting to contact server...")
            await fetch("/api/version");
            break
          }catch(err){
            console.log("Failed to contact server. Retrying...")
          }
        }  
        console.log("Server updated!")
        window.location.reload();
      }}>
        Update
      </Button>
      <Loading show={isUpdating} />
    </div>
  )

}

function Loading(props) {
  if (props.show === false) return <div></div>
  return (
      <Dimmer active style={{position: "fixed", zIndex: "10"}}>
          <Loader indeterminate>Updating server... This may take a while</Loader>
      </Dimmer>
  )
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
async function getConfigurationFile() {
  const res = await fetch(`/api/admin?auth=${getCachedAuth()}&action=getRawConfigFile`);
  const data = await res.text()
  return data
}