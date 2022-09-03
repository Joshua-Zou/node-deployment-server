# Node Deployment Server

## Table of Contents
 - [Description](#description)
 - [Features](#features)
 - [Setup](#setup)
 - [Config File](#nds_configjson)
 - [Deployment](#deployment)
 - [Deployment Settings](#deployment-settings)
 - [NDS Jobs](#nds-jobs-v1410)
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
**Important:** Windows built-in compressing may not work! Instead, use 7-zip
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

**Environment Variables**\
Allows you to set environment variables in the standard KEY-VALUE pair\
*Requires re-deploy to apply changes*  

**Container Settings**
 - Start deployment on computer startup
 
*Requires re-deploy to apply changes*  

**Attached Storage Spaces**\
Attach storage spaces (docker volumes) into your deployment, and mount them as folders inside of the specified mountpath.\
*Requires re-deploy to apply changes*  

## NDS Jobs (v1.4.10)
### Introduction
NDS Jobs are a quick and easy way to run management jobs periodically to check on the status of deployments, backup volumes, and many more actions. 
### Quick start
*This requires read-write or admin privileges\
First, simply navigate to the jobs page, and click "new job." You will be prompted to enter a name for the new job.\
Then, click the edit icon, and you will be taken to the job configuration page.

### Options (Gui)
 - `Job Enabled`: default `false`. This enables you to prevent jobs from being executed
 - `Name`: Allows you to change the display name of the job. Allowed to have duplicate names
 - `Actions` - The actions that the job executes in order
	 - Type: `Backup Volume` - Copies the entire volume to another directory (can be a Windows netowk path)
		 - `Volume` - The volume to backup
		 - `Path` - The path to the directory to store the volume Absolute or relative paths allowed. (Everything in this directory will be deleted)
	 - Type: `Check Deployment` - Allows you to check the status of deployments and perform actions
		 - `Deployment` - The deployment to check
		 - `On running` - Actions to perform when discovered that deployment is running
			 - *Valid parameters same as `on failed to start`* (see below)
		 - `On failed to start` - Actions to perform when discovered that deployment has failed to start
			 - `Fetch API` - Allows you to make an API request to a network server
				 - `Type`: `Fetch` (Unchangable)
				 - `Method`: The method to use to Fetch. (`GET` `POST` `PUT` `PATCH` `DELETE`)
				 - `URL`: The url to make the request to. (Must include protocol and domain)
				 - `Body`: The body to send (Doesn't work on `GET` requests
			- `Manipulate Container`
				- `Type`: The type of action to perform on the deployment. (`pause`, `unpause`, `restart`, `stop`, `remove`)
				- `Deployments`: The deployment to perform said action
### Options (config file)
Example
```json
{
            "id": "job id (generated by NDS)",
            "name": "your name",
            "run_every": 60 // in minutes,
            "enabled": false,
            "actions": [
                {
                    "action": "backup_volume",
                    "data": {
                        "volume_id": "volume id",
                        "path": "./path/to/backup"
                    }
                },
                {
                    "action": "check_deployment",
                    "data": {
                        "container_id": "container id",
                        "running": [
                            {
                                "type": "fetch",
                                "method": "GET / POST / PUT / PATCH / DELETE",
                                "url": "https://www.example.com",
                                "body": "{}"
                            },
                            {
                                "type": "restart",
                                "container_id": "container id"
                            }
                        ],
                        "failed to start": []
                    }
                }
            ],
            "version": 1 // Changing this will alert NDS to update the job
        }
```
## Update Guide
### Updating from v1.4.2 to any later version:
 1. Log into an adnimistrator account in the NDS dashboard.
 2. If there is a newer version available, you will see a green arrow in the menu. 
 3. Click on this green arrow. You will be taken to the update page
 4. Click "Update" and confirm that you want to update. The system will automatically update!

### Legacy Update system
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
