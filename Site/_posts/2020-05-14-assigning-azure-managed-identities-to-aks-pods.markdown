---
layout: post
current: post
cover:  /assets/images/covers/aadpodidentity.jpg
smallcover:  /assets/images/covers/aadpodidentity-small.jpg
navigation: True
title: Assigning Azure managed identities to pods in AKS
date: 2020-05-14 15:49:00
tags: [kubernetes,aks,azure]
class: post-template
subclass: 'post'
author: zerokoll
---
As the title says, this post will cover how you can assign managed identities to your pods when running in Azure Kubernetes Service (AKS). But before we get started, let's have a quick look at what a managed identity is.

## What are managed identities?

Managed identities in Azure is a way to create identities in Azure Active Directory (AAD) and then being able to use these from services running in Azure. However, to make it a bit more complicated, managed identity is more of an overarching term for a more technical thing called a Service Principal (SP). A service principal is an identity created in an Azure Active Directory (AAD) tenant, and that allows you to assign access rights to resources in Azure. 

And to make it even more complicated, at least for me who isn't a AD person, you don't actually create an SP to manage the access rights. Instead, you create an AD application, which is used to assign the correct access rights. But as I said, that might only be me who finds that confusing. "Select Service Principal" means "Please select an AAD application". But to other people, that probably makes a lot of sense…

Anyhow…some PaaS services in Azure can then be assigned a managed identity, allowing the application running in that service to communicate with other Azure resources using that identity. This allows us to manage access rights to different resources using an AAD identity using the AAD, instead of having credentials being added to the application.

For example, if you assign an identity to your web app, that identity can then be given access to for example a storage account, or even an individual container in a storage account, all without having to expose any credentials to the application. Instead, the application can ask for an access token based on the assigned identity, and use that token to access the required resource. 

In this post, I want to explain how to accomplish this using pods in AKS.

### But wait…there are 2 types of identities

But before we can get to that point, we need to understand one more thing… In Azure, there are 2 different types of  identities. There is the Service Principal, as already mentioned, as well as something called a Managed Service Identity (MSI). 

To be honest, they aren't really 2 different things, but more of 2 versions of the same thing. An MSI creates a creates a SP under the hood. However, an MSI is an Azure resource on its own. This includes a pretty important feature that we will see soon, and that is that you can assign access rights to the identity. Ok, that's a bit meta… It means that you can assign access rights to the identity, allowing another identity to use that identity. This is a feature that you will see in use pretty soon.

### And there is more…

On top of all of that, there are actually 2 different types of managed identities. There is something called a system-assigned identity, and one called user-assigned. 

The main difference is the way that their lifetime is managed. A system-assigned identity is tied to an Azure resource. This means that the identity lives in a symbiotic relation with the resource, and is removed when the resource is removed. 

As an example, if you let Azure assign an identity to your web app, you can use that identity to assign access rights to other resources. But as soon as the web app is deleted, the identity is removed as well.

The user-assigned version is a separate resource that has its own lifetime. You create it separately from your resource, and then you can assign it to the resource manually. However, when your web app for example is removed, the identity lives on.

I hope all of that that makes some form of sense. And the reason that I talked about all of that before getting to the real topic, is that I want to refer to some of this information during the rest of the post, to explain how things work.

## The application code

I'm going to use a VERY simple ASP.NET Core application to demonstrate how we can get the access token that we use to access other resources. Luckily, we don't have to write a ton of code to get this to work. Instead, all we need to do, is to add a NuGet package and 2 lines of code.

### Microsoft.Azure.Services.AppAuthentication

To help out with the retrieval of the token, I have added a reference to the NuGet package [Microsoft.Azure.Services.AppAuthentication](https://www.nuget.org/packages/Microsoft.Azure.Services.AppAuthentication/){:target=_blank}. This package includes a class called `AzureServiceTokenProvider`. This can beused to get hold of the access tokens we need.

It calls a token endpoint in Azure to get the token. However, to call that endpoint, you need to identify yourself using some form of identity. The token endpoint then uses that entity to create an access token that we can forward to other services to identity ourselves. The problem with this approach is that we want it to be able to work both locally, and in the cloud. In the cloud, we want to use that managed identity that we have assigned our application, but locally we don't have that possibility. That is why this NuGet package uses a couple of different ways to locate the identity to use. 

Locally, it looks for a signed in user using the Azure CLI, and in the cloud, it uses the assigned identity. This allows us to run our both locally and in the cloud, without needing to have a bunch of forks in our code.

__Note:__ As you might have understood by now, you are going to need the Azure CLI. So if you want to try this out, I recommend running out and installing it. It is available [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest){:target=_blank}

### The code
 
To make the application as simple as possible, I created a blank ASP.NET Coe web application, and replaced the default middleware with the following code

```csharp
app.Run(async (context) =>
{
    // Don't do this! 
    //  This code is just to show that we can get an access token
    // The token should not be exposed and only be used in your code server side
    var tokenProvider = new AzureServiceTokenProvider();
    try {
        var token = await tokenProvider.GetAccessTokenAsync("https://storage.azure.com/");
        await context.Response.WriteAsync("Token: " + token);
    } catch (Exception ex) {
        await context.Response.WriteAsync("Could not retrieve token...");
    }
});
```

If we start this application without being logged in to the Azure CLI, we are met with the following screen

![Unable to retrieve AAD Token](/assets/images/aadpodidentity/token.png "Unable to retrieve AAD Token")

On the other hand, if we open up a terminal and log in using the Azure CLI

```bash
az login
```

And then refresh the page. We are met by something like this

![Unable to retrieve AAD Token](/assets/images/aadpodidentity/token2.png "Unable to retrieve AAD Token")

Ok, so the code works!

__Warning:__ This token can be very dangerous, as it might give the owner of it access to resources in you subscription. I suggest __NOT__ displaying it like this, or logging it for example. It does have a defined lifetime, but still, it should be kept secret. I am just using it like this in my demo, where the identity doesn't have access to anything.

__Note:__ If you have more than one Azure subscription, you can list the available subscriptions using `az account list`, and then select the subscription you want by running `az account set -s <SUBSCRIPTION ID>`

Next I created a Docker image for the application, and uploaded that to my Azure Container Registry.

## Setting up the AKS cluster

To be able to demo this, I went in to the porta and spun up an AKS cluster. I left pretty much everything the default, except that I decreased the node count to 1 to save money. I suggest doing the same if you just want to try this out. There is no reason to have a big cluster to test this.

Once the AKS cluster is up and running, we need to configure our `kubectl` context. This can be a bit of a hassle, but it is REALLY easy using the Azure CLI! All you need to do is to run the following command

```bash
az aks get-credentials -n <CLUSTER NAME> -g <RESOURCE GROUP>
```

Just replace the cluster name and name of the resource group you created it in, and `kubectl` will automatically get a new context set up and selected, allowing you to start configuring your new cluster.

Let's start out by seeing what happens when we run the container as is in the cluster. To do this, I've created a pod spec that looks like this

```
apiVersion: v1
kind: Pod
metadata:
  name: podidentitydemo
spec:
  containers:
  - name: podidentitydemo
    image: zerokoll.azurecr.io/azurepodidentitydemo
    ports:
    - containerPort: 80
  imagePullSecrets:
  - name: zerokoll
```

As you can see, it is a pretty basic pod. It runs a single container based on the image I have created. It exposes port 80, and uses an `imagePullSecret` to access the private repo.

Once I've deployed it to my cluster, I can set up some port forwarding using

```bash
kubectl port-forward pod/podidentitydemo 8080:80
```

Browsing to localhost:8080, I'm met by a screen saying __Could not retrieve token…__, as expected. To sort this out, we need to assign a Azure managed identity to the pod. Right now, the pod has no Azure identity. 

## Adding AAD Pod Identity to the cluster

To get this to work, I'm using an open source project called [aad-pod-identity](https://github.com/Azure/aad-pod-identity). This project can be used to add a few of resources to the cluster that allows us to assign an Azure identity to our pods, that can then be used by the `AzureServiceTokenProvider` to retrieve a token.

To install these resources, we can run the following command

```bash
kubectl apply -f https://raw.githubusercontent.com/Azure/aad-pod-identity/master/deploy/infra/deployment-rbac.yaml
```

The output will define exactly what is being added to the cluster.

### How does it work

Before we carry on, I just quickly want to cover what is actually happening under the hood…

The way that this whole thing works, is that it installs a few resources in our cluster. Among the installed things are a couple of new resource types called `AzureIdentity` and `AzureIdentityBinding`. 

The `AzureIdentity` type is used to define an Azure identity that we want to use. And being that it is just a resource in the cluster, we can have as many different identities as we need. The identity is then bound to a set of pods using a `AzureIdentityBinding`. The binding defines the identity to use, and a label value to use to locate the pods to bind it to. The label value is compared to a label called `aadpodidbinding` on the pods.

Once we have bound an identity to a pod, the newly installed resources updates the iptables of that pod to basically hijack any request going to the access token endpoint. Whenever a call is made from the pod to this endpoint, the system proxies this request to the token endpoint, adding the bound AzureIdentity's information to the call to make it look like the pods call is being made by this identity.

## Setting up the identities

Before we get started, we need to figure out if we want to use a service principal, or a managed service identity. In most cases, the managed service identity way is the way to go. However, I want to show both ways, as the service principal way is very poorly documented at the moment. 

### Using a managed service identity

If we  want to use an MSI, we need to start out by creating an identity. However, there is a small caveat here. 

The AKS service needs to have access to this identity. The reason for this, is that when the system wants to get the identity information to add to the proxied token request, it is done on behalf of the service. Luckily, the AKS service is automatically bound to an SP that can be used to give it access to an identity that we create. And the easiest way to do this, is to create the identity in the resource group used to store the cluster nodes.

The worker nodes for the cluster is automatically added to a separate resource group, to which the AKS service has access. The AKS service's SP is given control over this group allow it to do things like scaling up the node count. This means that any resource created in this group can be used by the AKS SP.

__Node:__ If you for some reason don't want the identity in that group, you can add it somewhere else, and give the AKS SP `Microsoft.ManagedIdentity/userAssignedIdentities/\*/assign/action` permission to the resource.

The first thing we need to do is to locate that resource group. By default, it is given a name that looks like `MC_<AKS RESOURCE GROUP>_<AKS SERVICE NAME>_<LOCATION>`. In my case, that ended up being `MC_AzurePodIdentityDemo_podidentitydemo_northeurope` as my AKS resource was called `podidentitydemo`, was placed in a resource group called `AzurePodIdentityDemo` and located in the north Europe datacenter.

If you want to, you can use the portal to do this, but I'm going to use the Azure CLI. So to locate my resource group, I'll run

```bash
az group list -o table
```

This gives me a list of all the resource groups in my subscription. Once I have found my group, I can create the identity by running

```bash
az identity create -g <resourcegroup> -n <identity name>
```

This generates a response with a bunch of information about the generated identity. The only parts that are interesting right now, is the `id` and the ´clientId´. So make a note of those as they will be used going forward.

Once you have your identity, you can assign access rights to it using

```bash
az role assignment create --assignee <ClientId> --role 'Storage Blob Data Reader' --scope <Scope>
```

The `ClientId`, is the client id for the identity. The role, one of the defined one in Azure. You can find those [here](https://docs.microsoft.com/en-us/azure/role-based-access-control/built-in-roles){:target=_blank}. And finally, you need to tell it where this role should be valid using the scope variable. The easiest way to find the scope is to browse to the resource you want to give access to, and look at the address bar. If you for example want to give access to a blob storage account, the address in you browser will be something that looks like this `https://portal.azure.com/#@<TENANT ID>/resource/subscriptions/<SUBSCRIPTION ID>/resourceGroups/<RESOURCE GROUP>/providers/Microsoft.Storage/storageAccounts/<STORAGE ACCOUNT>/overview`. The scope for this resource is then `/subscriptions/<SUBSCRIPTION ID>/resourceGroups/<RESOURCE GROUP>/providers/Microsoft.Storage/storageAccounts/<STORAGE ACCOUNT>`.

Now that you have an identity set up, you can add an AzureIdentity resource to the cluster. It should look like this

```
apiVersion: "aadpodidentity.k8s.io/v1"
kind: AzureIdentity
metadata:
  name: azureaccess
spec:
  type: 0
  ResourceID: <RESOURCE ID>
  ClientID: <CLIENT ID>
```

The __RESOURCE ID__ is the resource id of your identity, which is the "path" that came back as `id` when you created the identity. And the __CLIENT ID__ is the GUID id of the identity, which came back as `clientId`. The `type` is set to 0, to define that the identity being used is a managed service identity.

After adding that resource to the cluster, it needs to be bound to our pod. This is done by adding an AzureIdentityBinding that looks like this to the cluster

```
apiVersion: "aadpodidentity.k8s.io/v1"
kind: AzureIdentityBinding
metadata:
  name: azureaccess
spec:
  AzureIdentity: azureaccess
  Selector: azure-access
```

The value for the `AzureIdentity` property should be the name of the `AzureIdentity` we just created. And the value for the `selector`, is the value that the pod's `aadpodidbinding` label should be set to, to make it use this identity.

Once this binding has been added, we need to update our pod to have the correct label. So we need to update the pod spec to include the `aadpodidbinding` label like this

```
apiVersion: v1
kind: Pod
metadata:
  name: podidentitydemo
  labels: 
    aadpodidbinding: azure-access
spec:
  …
```

Applying that change, the system should now have assigned the pod an identity, and browsing to it should result in an access token to be presented. If not, I will come back to some debugging suggestions later on.

### Using a service principal

If you want to use a service principal instead of a managed identity, there are a few things that need to be changed. Mainly in the way that you define you AzureIdentity. Most blog posts, and even the documentation on GitHub, just says that the only thing you have to do is change the `type` to 1 to use an SP instead. However, it is a bit more complicated than that.

First and foremost, you will need to tell the system how to access the SP. This means giving the system not only the SP to use, but a secret/password to be used to access it. This is added to the cluster as a Kubernetes secret. But before we can do that, we need to get hold of a secret/password.

If you are creating a new SP on your own, you can do this by executing

```bash
az ad sp create-for-rbac --name <PRINCIPAL NAME>
```

This returns a JSON blob with information about the newly created principal. That JSON contains among other things the generated AAD application's id, the tenant it was added to, and a password. All these things are things we will use.

It is also worth noting that the principal by default is given the "Contributor" role on the subscription, which is probably a bit too much wide access. But I will leave it up to you to figure out how much access your application needs.

__Note:__ If you want to do this through the portal, you need to go to the Azure Active Directory part, and create a new App Registration. When you do this, you do not get a secret/password. You need to manually go and create one of those. Just remember that after creating the secret, it will only by visible until you close the blade. So don't forget it…

If you want to use an existing SP, you need to locate the SP's information using either the CLI or the portal (remember, it is an App Registration in the portal), and potentially generate a new secret.

Once you have your principal, you need to add the secret to the cluster. This is easily done using `kubectl`

```bash
kubectl create secret generic <SECRET NAME> --from-literal=password=<SP SECRET>
```

The name of the value in the secret doesn't matter. Naming it `password` just seemed like a good idea…

Now that the SP secret/password has been added to the cluster, we can create an `AzureIdentity` like this

```
apiVersion: "aadpodidentity.k8s.io/v1"
kind: AzureIdentity
metadata:
  name: spaccess
spec:
  type: 1
  TenantId: <TENANT ID>
  ClientID: <SP ID / APP ID>
  ClientPassword: {"Name":"<SECRET NAME>","Namespace":"default"}
```

As you can see, we change the `type` to 1, add a `TenantId`, `ClientID` and a `ClientPassword` value. The `ClientPassword` requires us to define both the name of the K8s secret we added the SP secret/password to, and the namespace it was put in. 

With this `AzureIdentity` in place, we can set up the binding in the same way as we did with the MSI.

```
apiVersion: "aadpodidentity.k8s.io/v1"
kind: AzureIdentityBinding
metadata:
  name: spaccess
spec:
  AzureIdentity: spaccess
  Selector: sp-access
```

I've used a different selector here, to allow me to choose identity to use. Make sure you don't have overlapping selectors in different bindings.

To try it out, we will need to first delete the pod, update the `aadpodidbinding` label, and then re-deploy it. The reason that we can't just update the pod is that adding the label won't force a restart of the container. And this means that the access token is cached for us by the token client.

## Debugging potential problems

I'm not saying that this is an easy thing to debug in any way. I had quite a bit of problems trying to figure out how to use SPs. Debugging this was quite hard. The logs don't say a ton, but can help out a bit. But the question is where to look. 

First of all, we have a couple of pods named `mic-XXXXXXXXX-XXXXX`. These are responsible to tracking, and assigning pod identities. So the logs from these will tell you, in not a very easy to read way, whether or not they can see your identities, bindings and pods. Basically if you have connected the resources properly. So it is a good idea to run `kubectl logs mic-XXXXXXXXX-XXXXX` if things aren't working.

If it seems as if the system aren't seeing you identities or bindings, you can run `kubectl get AzureIdentity` to get the identities defined in the cluster, and `kubectl get AzureIdentityBinding` to see the bindings. And if you want more information, you can always use `kubectl describe` to find out if they have the correct settings.

You can also look at the logs for the pod called `nmi-XXXXX`. This is the one that is responsible for intercepting and proxying the requests to the token issuer endpoint. This will tell you if it has problems to locate your assigned identity etc. Looking at these logs will generate a response similar to

```bash
kubectl logs nmi-p8dnm
time="2020-01-25T09:55:08Z" level=warning msg="parameter resource cannot be empty" req.method=GET req.path=/metadata/identity/oauth2/token req.remote=10.244.0.9
time="2020-01-25T09:55:08Z" level=info msg="Status (400) took 58500 ns" req.method=GET req.path=/metadata/identity/oauth2/token req.remote=10.244.0.9
time="2020-01-25T09:55:08Z" level=info msg="matched identityType:0 clientid:e074##### REDACTED #####0f68 resource:https://storage.azure.com/" req.method=GET req.path=/metadata/identity/oauth2/token req.remote=10.244.0.9
time="2020-01-25T09:55:08Z" level=info msg="Status (200) took 350698785 ns" req.method=GET req.path=/metadata/identity/oauth2/token req.remote=10.244.0.9
```

As you can see, it logs every HTTP request with status codes and messages. In the above logs, there is first a problem, an HTTP 400, and then a successful HTTP 200. I must have made some identity changes between those calls…

That's it! That should be most of the things you need to know if you want to get started with using Azure managed identities from your pods. There are still some small things I haven't covered, like having bindings only work within a specific namespace and such. But once you have understood the parts I just covered, you are good to go and look at the more complicated scenarios. Not that there seems to be a __lot__ more you can do at the moment.
