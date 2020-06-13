import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure";
import { CDNCustomDomainResource } from "./cdn-custom-domain";

export class WebsiteEnvironment {
    private baseName: string;
    private storageAccount: azure.storage.Account;
    private endpoint: azure.cdn.Endpoint;
    private cnameRecord: azure.dns.CNameRecord;
    
    constructor(private resourceGroup: azure.core.ResourceGroup, projectName: string, suffix?: string) {
        this.baseName = projectName + (suffix ? "-" + suffix : "");
    
        this.storageAccount = new azure.storage.Account(this.baseName, {
            name: this.baseName.toLowerCase().replace("-", ""),
            resourceGroupName: resourceGroup.name,
            accountTier: "Standard",
            accountReplicationType: "LRS",
            enableHttpsTrafficOnly: true,
            staticWebsite: {
                indexDocument: "index.html",
                error404Document: "404.html"
            }
        });
    }
    
    addCdnEndpoint(cdnProfile: azure.cdn.Profile, duration?: string) {
        this.endpoint = new azure.cdn.Endpoint(this.baseName, {
            name: this.baseName.toLowerCase(),
            resourceGroupName: this.resourceGroup.name,
            profileName: cdnProfile.name,
            originHostHeader: this.storageAccount.primaryWebHost,
            origins: [{
                name: "blobstorage",
                hostName: this.storageAccount.primaryWebHost,
            }],
            globalDeliveryRule: {
                cacheExpirationAction: duration ? 
                                        {
                                            behavior: "Override",
                                            duration: duration
                                        } :
                                        {
                                            behavior: "BypassCache"
                                        }
            },
            deliveryRules: [
                {
                    name: "httptohttps",
                    order: 1,
                    requestSchemeCondition: { matchValues: ["HTTP"] },
                    urlRedirectAction: { redirectType: "PermanentRedirect", protocol: "Https" }
                }
            ]
        });

        this.cnameRecord = new azure.dns.CNameRecord(this.baseName, {
            name: this.baseName.toLowerCase(),
            resourceGroupName: "DNS",
            ttl: 3600,
            zoneName: "zerokoll.com",
            targetResourceId: this.endpoint.id
        }, { parent: this.endpoint })

        new CDNCustomDomainResource(this.baseName, {
            customDomainHostName: this.baseName.toLowerCase() + ".zerokoll.com",
            profileName: cdnProfile.name,
            endpointName: this.endpoint.name,
            httpsEnabled: true,
            resourceGroupName: this.resourceGroup.name
        }, { parent: this.cnameRecord });
    }
    
    get storageEndpoint() {
        return pulumi.interpolate`${this.storageAccount.primaryWebEndpoint}`;
    }
    get storageConnectionString() {
        return pulumi.interpolate`${this.storageAccount.primaryConnectionString}`;
    }
    get cdnUrl() {
        // Allow it some time after the deployment to get ready.
        return pulumi.interpolate`https://${this.endpoint.hostName}/`;
    }
    get azCdnPurgeCommand() {
        return pulumi.interpolate`az cdn endpoint purge -g ${this.endpoint.resourceGroupName} -n ${this.endpoint.name} --profile-name ${this.endpoint.profileName} --content-paths /*`
    }
    get url() {
        return this.cnameRecord.fqdn.apply(x => "https://" + x.substr(0, x.length - 1));
    }
}