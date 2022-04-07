import styles from './Header.module.css';
import { useState, useEffect } from 'react';
import SignInModal from "../SignInModal/signInModal.js";
import { Icon } from 'semantic-ui-react';
import ActiveLink from "../ActiveLink.js"


export default function Header() {
    const [data, setData] = useState({loading: true});
    const [modalOpen, setModalOpen] = useState("");
    const [modalText, setModalText] = useState("");
    function RenderSignedIn(props) {
        const [signInVisibility, setSignInVisibility] = useState(false);
        if (props.data.loading === true) return (<div className={styles.signedIn}>
            <Icon loading name="circle notched"/>
        </div>)
        if (!props.data.error) {
            if (props.data.permission === "admin") {
                return (
                    <div className={styles.signedIn}>
                        <ActiveLink className={styles.username} href="/dashboard">Dashboard</ActiveLink>
                        <ActiveLink className={styles.username} href="/admin"><Icon name="user"/>{props.data.user}</ActiveLink>
                        <a className={styles.logout} onClick={() => {sessionStorage.removeItem("auth"); localStorage.removeItem("auth"); window.location.href="/"}}>Logout</a>
                    </div>
                )
            } else {
                return (
                    <div className={styles.signedIn}>
                        <ActiveLink className={styles.username} href="/dashboard">Dashboard</ActiveLink>
                        <ActiveLink className={styles.username} href="/dashboard"><Icon name="user"/>{props.data.user}</ActiveLink>
                        <a className={styles.logout} onClick={() => {sessionStorage.removeItem("auth"); localStorage.removeItem("auth"); window.location.href="/"}}>Logout</a>
                    </div>
                )
            }
        } else {
            return (
                <div className={styles.signedIn}>
                    <SignInModal show={signInVisibility} changeShow={setSignInVisibility} />
                    <a onClick={() => { setSignInVisibility(true) }}>Sign in</a>
                </div>
            )
        }
    }
    if (data.loading === true) {
        getLoginInfo().then(data => {
            setData(data)
            showMessage();
        })
    }
    return (
        <header className={styles.header}>
            <ActiveLink href="/"><img src="/logo.svg" className={styles.logo} alt="logo" /><span className={styles.logoText}>Node Deployment Server</span></ActiveLink>
            <RenderSignedIn data={data}/>
            <div className={`messageModal ${modalOpen}`} onClick={setModalOpen}>
                {modalText}
            </div>
        </header>
    )
    function showMessage(){
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('message') && urlParams.get('message') !== "null") {
            let message = urlParams.get('message')
            urlParams.set("message", null);
            setModalOpen("open");
            setModalText(message);
            setTimeout(function(){
                changeQueryString("?"+urlParams.toString())  
            }, 1000)
            
        }
    }
}

async function getLoginInfo() {
    const res = await fetch(`/api/user?auth=${getCachedAuth()}`);
    const data = await res.json()
    return data;
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
function changeQueryString(searchString, documentTitle){      
    documentTitle = typeof documentTitle !== 'undefined' ? documentTitle : document.title;      
    var urlSplit=( window.location.href ).split( "?" );      
    var obj = { Title: documentTitle, Url: urlSplit[0] + searchString };      
    history.pushState(obj, obj.Title, obj.Url);      
}