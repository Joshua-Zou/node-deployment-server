import styles from './Footer.module.css';
import {useState, useEffect} from "react"

export default function Footer(){
    return (
        <footer className={styles.footer}>
            <span className={styles.text}>Powered with ❤️ and <a href="https://github.com/Joshua-Zou/node-deployment-server" rel="noreferrer" target="_blank">Node-Deployment-Server</a> |             <a href="https://github.com/Joshua-Zou/node-deployment-server#update-guide" rel="noreferrer" target="_blank">Update Guide</a> | <Version/></span>
        </footer>
    )
}
function Version(){
    const [version, setVersion] = useState("");
    useEffect(() => {
        getVersion().then(data => {
            setVersion(data)
        })
    })
    return (
        <span>{version}</span>
    )
}
async function getVersion(){
    let res = await fetch("/api/version");
    let data = await res.text()
    return data;
}