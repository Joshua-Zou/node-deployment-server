import styles from './Footer.module.css';

export default function Footer(){
    return (
        <footer className={styles.footer}>
            <span className={styles.text}>Powered with ❤️ and <a href="">Node-Deployment-Server</a></span>
        </footer>
    )
}