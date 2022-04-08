## Node Deployment Server

### Table of Contents
 - [Description](#description)
 - [Features](#features)
 - [Setup](#setup)
 - [Config File](#nds_configjson)
 - [Deployment](#deployment)


### Description
As the name suggests, NDS is a quick and easy platform where users can create their own "cloud" and easily deploy, manage, and update their Node.JS webapps. NDS is powered by Docker.

### Features

 - Easily deploy code to a remote server running NDS
 - Directly upload your code, Git hosting not required!
 - Create resource limits on individiual deployments
 - Easily change port mappings
 - Easily change deployment node versions
 - Set different permissions for different users (admin, read/write, readonly)
 - All this can be done from the webapp!

### Setup
Installing NDS is extremely simple. All you need installed on your system is Docker and a Node LTS version, preferably version 14 or higher.
 1. Grab the latest release from Github, and download the zip file
 2. Extract the zip file
 3. Navigate to the zip file in terminal, and run `npm install` to install the required dependencies
 4. Everything's all set! Running `npm run start` will start the server on port 3100, (configurable)
 5. Navigate to the server in your browser, and enter your credentials. (Defaults are `username: admin` `password: password`

### nds_config.json
This file describes all of the settings that NDS uses, like authorized users, ports, deployments, and authorization keys. Many of these can edited directly in the webapp if the user has the `admin` privilege.

### Deployment
Deploying is easy! 

 1. Navigate to the dashboard and click "New Deployment"
 2. Enter the deployment's name, port mappings, and memory. (All this can be changed at any point)
 3. Move to the `deploy` tab, and upload your code in a zip file. 
**Important:** The folder containing your deployment MUST contain a `package.json` file in its highest directory. See below for examples
**Do this:**
![image](https://user-images.githubusercontent.com/77520157/162546470-a37c80f1-da96-489b-acea-33799b484596.png)
**Not this:**
![image](https://user-images.githubusercontent.com/77520157/162546496-1c2e30e2-d39d-4395-a555-5c04ccbe47e8.png)
 4. After uploading your code, you can navigate to the `explore` tab to preview your files before deploying
 5. Move to the `deploy` tab and hit `deploy`! 
