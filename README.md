# Node Deployment Server

## Table of Contents
 - [Description](#description)
 - [Features](#features)
 - [Setup](#setup)
 - [Config File](#nds_configjson)
 - [Deployment](#deployment)
 - [Deployment Settings](#deployment-settings)
 - [Update Guide](#update-guide)
 - [Using non-nodejs images](#using-non-nodejs-images)

## Description
As the name suggests, NDS is a quick and easy platform where users can create their own "cloud" and easily deploy, manage, and update their Node.JS webapps. NDS is powered by Docker.

## Features

 - Easily deploy code to a remote server running NDS
 - Directly upload your code, Git hosting not required!
 - Create resource limits on individiual deployments
 - Easily change port mappings
 - Easily change deployment node versions
 - Set different permissions for different users (admin, read/write, readonly)
 - All this can be done from the webapp!

## Setup
Installing NDS is extremely simple. All you need installed on your system is Docker and a Node LTS version, preferably version 14 or higher.
 1. Grab the latest release from Github, and download the zip file
 2. Extract the zip file
 3. Navigate to the zip file in terminal, and run `npm install` to install the required dependencies
 4. Everything's all set! Running `npm run start` will start the server on port 3100, (configurable)
 5. Navigate to the server in your browser, and enter your credentials. (Defaults are `username: admin` `password: password`

## nds_config.json
This file describes all of the settings that NDS uses, like authorized users, ports, deployments, and authorization keys. Many of these can edited directly in the webapp if the user has the `admin` privilege.

## Deployment
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


## Deployment Settings
 **Port Mappings**\
 This allows you to expose ports from inside the deployment, and map them into external ports.  \
 External port must be different across different deployments.\
 `Internal port` - Integer (0-65535)  \
 `External port` - Integer (0-65535)  \
 *Requires re-deploy to apply changes*\
 <br>
 **Deployment Name**\
 This allows you to change the visible deployment name. This is purely cosmetic and does not change anything\
 `Name` - String\
 *Does not require re-deploy to apply changes*\
 <br>
**Deployment Environment**\
`Memory`: Integer (min: 512). In MB\
`NodeJS Image`: String - A valid, public NodeJS base image from the [Docker Registry](https://hub.docker.com/_/node)  \
`Start Command`: String - the NPM command that gets run when deployment boots.   \
*Requires re-deploy to apply changes*  

## Update Guide
Updating to a newer version of NDS is simple! Simply follow the below steps:

 1. Download the latest version of NDS [here](https://github.com/Joshua-Zou/node-deployment-server/releases)
 2. Extract the folder. **Important**: If you are extracting to the same parent directory as your current installation, make sure that the new folder is a different name, otherwise you will overwrite your deployments.
 3. Copy your `nds_config.json` file from your old version and replace the `nds_config.json` in the new version 
 4. Copy the entire `deployments` folder from your old version and replace the `deployments` folder in the new version. - **IMPORTANT:** If you are upgrading from a version less than v1.2.0 to a version higher, the dockerfile template changed in. So, you must copy all of your deployment folders *inside* of the `deployment` folder, and NOT the entire `deployment` folder.
 5. Navigate to the new server in your terminal and run `npm install`
 6. Then, run `npm start` to start the server. If it runs fine, congrats! You successfully updated your server. However, if it throws and error saying that `nds_config` is outdated, continue to step 7
 7. To update `nds_config.json` to the latest config version, simply run `npm run update-config`. Once this finishes running, start the server again and everything should work!

## Using non-nodejs images
If you would like to deploy a custom image, whether it be a python deployment or a pi-hole server, we've got you covered! \
Simply change the NodeJS image field to your image of choice (doesn't need to be nodejs)\
Then, change the Run command to your custom run command (cannot be NPM since NPM is only included in the nodejs base image). You **can** leave this run command blank.\
If you would like to change the install command, change that field to your custom installation script (ex. `pip install -r requirements.txt`) . **This field MUST be filled out with a valid command** If you wish to not do anything, simply type in `ls`, the command to list files and directories.
