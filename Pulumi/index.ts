import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure";
import { WebsiteEnvironment } from "./website-environment";
import { GetCommentsHandler } from "./get-comments-handler";
import { AddCommentsHandler } from "./add-comments-handler";

const config = new pulumi.Config();
const projectName = config.require("projectName");

const resourceGroup = new azure.core.ResourceGroup(projectName, { name: projectName });

const prodEnvironment = new WebsiteEnvironment(resourceGroup, projectName);
const stagingEnvironment = new WebsiteEnvironment(resourceGroup, projectName, "Staging");

const cdnProfile =  new azure.cdn.Profile(projectName, {
    name: projectName,
    resourceGroupName: resourceGroup.name,
    sku: "Standard_Microsoft"
});

prodEnvironment.addCdnEndpoint(cdnProfile, "00:10:00");
stagingEnvironment.addCdnEndpoint(cdnProfile);

const addCommentFn = new azure.appservice.HttpFunction("AddComment", {
    route: "comments",
    methods: ["POST"],
    callback: AddCommentsHandler
});
const getCommentsFn = new azure.appservice.HttpFunction("GetComments", {
    route: "comments/{postId}",
    methods: ["GET"],
    callback: GetCommentsHandler
});
new azure.appservice.MultiCallbackFunctionApp(projectName, {
    name: projectName,
    resourceGroupName: resourceGroup.name,
    functions: [addCommentFn, getCommentsFn],
    httpsOnly: true,
    connectionStrings: [
        {
            name: "PRODUCTION",
            type: "Custom",
            value: prodEnvironment.storageConnectionString
        },
        {
            name: "STAGING",
            type: "Custom",
            value: stagingEnvironment.storageConnectionString
        }
    ],
    siteConfig: {
        cors: {
            allowedOrigins: [prodEnvironment.url, stagingEnvironment.url]
        }
    },
    hostSettings: {
        extensions: {
            http: {
                routePrefix: ""
            }
        }
    }
});

export const stagingStorageUrl = stagingEnvironment.storageEndpoint;
export const stagingCdnUrl = stagingEnvironment.cdnUrl;
export const azStagingCdnPurgeCommand = stagingEnvironment.azCdnPurgeCommand;
export const stagingUrl = stagingEnvironment.url;

export const productionStorageUrl = prodEnvironment.storageEndpoint;
export const productionCdnUrl = prodEnvironment.cdnUrl;
export const azProductionCdnPurgeCommand = prodEnvironment.azCdnPurgeCommand;
export const productionUrl = prodEnvironment.url;