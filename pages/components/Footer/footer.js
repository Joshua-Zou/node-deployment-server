import styles from './Footer.module.css';

export default function Footer(){
    return (
        <footer className={styles.footer}>
            <span className={styles.text}>Powered with ❤️ and <a href="https://github.com/Joshua-Zou/node-deployment-server" rel="noreferrer" target="_blank">Node-Deployment-Server</a> |             <a href="https://github.com/Joshua-Zou/node-deployment-server#update-guide" rel="noreferrer" target="_blank">Update Guide</a></span>
        </footer>
    )
}