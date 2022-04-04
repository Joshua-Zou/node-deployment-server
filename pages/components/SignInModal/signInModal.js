import styles from './signInModal.module.css';
import 'semantic-ui-css/semantic.min.css';
import {Button, Checkbox, Input} from 'semantic-ui-react';
import {useState, useEffect} from 'react';

export default function SignInModal(props){
    const [errorMessage, setErrorMessage] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [keepLoggedIn, setKeepLoggedIn] = useState(false);
    if (props.show === true) {
        return (
            <div>
                <div className={styles.container}>
                    <h3>Sign in</h3>
                    <Input icon='user' placeholder='Username' onChange={(e, d) => {setUsername(d.value)}}/>   
                    <br></br> 
                    <br></br>
                    <Input icon='key' placeholder='Password' type="password" onChange={(e, d) => {setPassword(d.value)}}/>    
                    <br></br>
                    <br></br>
                    <Checkbox label="Remember me" className={styles.checkbox} onChange={(e, d) => {setKeepLoggedIn(d.checked)}}/>
                    <br></br>
                    <span style={{display: "block", marginBottom: "5px", color: "red"}}>{errorMessage}</span>
                    <Button primary onClick={initiateLogin} className={styles.loginbtn}>Login</Button>
                </div>
                <div className={styles.dimmer} onClick={() => {props.changeShow(false)}}></div>
            </div>
        )
        function initiateLogin(){
            login(keepLoggedIn, username, password).then(authkey => {
                if (authkey.error) {
                    setErrorMessage(authkey.error)
                } else {
                    window.location.reload();
                }
            })
        }
    } else {
        return ""
    }
}

async function login(keepMeLoggedIn, username, password) {
    let res = await fetch(`/api/login?username=${username}&password=${password}`);
    let data = await res.json();
    if (data.authkey) {
        if (keepMeLoggedIn) {
            localStorage.setItem("auth", data.authkey);
            sessionStorage.removeItem("auth");
        } else {
            sessionStorage.setItem("auth", data.authkey);
            localStorage.removeItem("auth");
        }
        return data.authkey;
    } else {
        return {error: data.error};
    }
}