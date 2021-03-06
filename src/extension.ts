// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';

import { TaskManager } from './taskManager';

const xpath = require('xpath');
const dom = require('xmldom').DOMParser;
const fs = require("fs");
const axios = require('axios').default;
const exec = require('child_process').exec;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

function postMessage(panel: vscode.WebviewPanel, command: string, payload: object) {
	panel.webview.postMessage({ command: command, payload: payload });
}

function readCredentials(configuration: vscode.WorkspaceConfiguration, source: string, credentialsCallback: Function) {
	exec(configuration.credentialProviderFolder + "/CredentialProvider.Microsoft.exe -C -F Json -U " + source, function callback(error: any, stdout: any, stderr: any) {
		credentialsCallback({ source: source, credentials: JSON.parse(stdout) });
	});
}

function loadProjects(panel: vscode.WebviewPanel) {
	vscode.workspace.findFiles("**/*.csproj").then(files => {
		let projects = Array();
		files.map(x => x.fsPath).forEach(x => {
			let document = new dom().parseFromString(fs.readFileSync(x, "utf8"));
			let packagesReferences = xpath.select("//ItemGroup/PackageReference", document);
			let project = {
				path: x,
				projectName: path.basename(x),
				packages: Array()
			};
			packagesReferences.forEach((p: any) => {
				let projectPackage = {

					id: p.attributes.getNamedItem("Include").value,
					version: p.attributes.getNamedItem("Version").value
				};
				project.packages.push(projectPackage);
			});
			projects.push(project);
		});
		postMessage(panel, "setProjects", projects.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	});
}

export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.commands.registerCommand('extension.start', () => {
		let configuration = vscode.workspace.getConfiguration("NugetGallery");
		const panel = vscode.window.createWebviewPanel(
			'nuget-gallery', // Identifies the type of the webview. Used internally
			'NuGet Gallery', // Title of the panel displayed to the user
			vscode.ViewColumn.One, // Editor column to show the new webview panel in.
			{ enableScripts: true } // Webview options. More on these later.
		);

		let taskManager = new TaskManager(vscode.tasks.executeTask, (e: any) => {
			if (e.name === "nuget-gallery" && e.remaining === 0) {
				loadProjects(panel);
			}
		});
		vscode.tasks.onDidEndTask(e => taskManager.handleDidEndTask(e));

		panel.webview.onDidReceiveMessage(
			async message => {
				if (message.command === "reloadProjects") {
					loadProjects(panel);
				}
				else if (message.command === "reloadSources") {
					postMessage(panel, "setSources", configuration.sources);
				}
				else if (message.command === "getCredentials") {
					readCredentials(configuration, message.source, (cred: Object) => {
						postMessage(panel, "setCredentials", { source: message.source, credentials: cred });
					});
				}
				else {
					for (let i = 0; i < message.projects.length; i++) {
						let project = message.projects[i];
						let args = [message.command, project.projectPath, "package", message.package.id];
						if (message.command === 'add') {
							args.push("-v");
							args.push(message.version);
							args.push("-s");
							args.push(message.source);
						}
						let task = new vscode.Task(
							{ type: 'dotnet', task: `dotnet ${message.command}` },
							'nuget-gallery',
							'dotnet',
							new vscode.ShellExecution("dotnet", args)
						);
						taskManager.addTask(task);
					}
				}
			},
			undefined,
			context.subscriptions
		);


		let html = fs.readFileSync(path.join(context.extensionPath, 'web/dist', 'index.html'), "utf8");
		panel.webview.html = html;
	}));

}

// this method is called when your extension is deactivated
export function deactivate() { }
