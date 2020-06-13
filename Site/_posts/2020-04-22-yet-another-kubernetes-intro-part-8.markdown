---
layout: post
current: post
cover:  /assets/images/covers/intro-to-k8s.jpg
smallcover:  /assets/images/covers/intro-to-k8s-small.jpg
navigation: True
title: Yet Another Kubernetes Intro - Part 8 - Namespaces & Access Control
date: 2020-04-22 12:09:00
tags: [kubernetes,intro]
class: post-template
subclass: 'post'
author: zerokoll
---
I'm down to what I think is the second to last post in my introduction to Kubernetes series. Up until the [last post about storage](/yet-another-kubernetes-intro-part-7){:target=blank}, I think I had a pretty ok connection between the posts. However, I should maybe have planned the posts a bit better, because this one did unfortunately become a little disjointed as it covers two pretty separate things. I'm sorry about that, but it is pretty useful information.

## Namespaces

The first thing I want to cover in this post is another resource type called __namespaces__. Namespaces is a way to group, or "section off", resources in a cluster. This allows you to deploy several different solutions in the same cluster, and still be able to treat them as separate things. You can for example use it to deploy both your CD builds and staging builds in the same cluster without them interfering with eachother. Or run a bunch of different applications, all in their own area so they don't interfere with eachother. 

You can also set up role based access for namespaces to make sure that users and services are only allowed to access certain things. Something that can be very useful in a company with multiple development teams and solutions.

So, how have we gotten away with not talking about namespaces so far? Well, there is always one default namespace in a cluster. It is even called `default`. That is the namespace we have been working in so far. And if you don't specifically tell `kubectl` that you want to work with another namespace, it will just default to that. This is also why I think I wrote that executing `kubectl get all` will get you "sort of" everything. Well, first of all, it doesn't actually get you all resource types, but it also only gets you the resources in the default namespace.

### Retrieving resources in namespaces

Pretty much all the `kubectl` resource commands can take an extra flag called `--namespace` or `-n`, allowing you to specify what namespace you want to look in. For example

```bash
kubectl get pods -n my-namespace
```

Or, you can add `--all-namespaces` or `-A` to get the resources from literally all namespaces. Like this

```bash
kubectl get pods --all-namespaces
```

### Creating namespaces

Ok...so that seems useful, but how do we go about creating a namespace? Well, the easiest way is actually to use `kubectl`, and execute something like this

```bash
kubectl create namespace my-namespace
```

That will create a new namespace called `my-namespace`.

However, if you want to stick to YAML-files, which is definitely a more structured approach, the spec file would look something like this

```
apiVersion: v1
kind: Namespace
metadata:
   name: my-namespace
```

### Creating resources in namespaces

Now that we have a namespace, how do we go about creating resources in that namespace? Well, that is actually very easy. A lot of the resource specs support a `metadata.namespace` property that allows you to define the namespace that the resource should be created in. For example, to create a pod in the namespace that was created above, you could use a pod spec like this

```
apiVersion: v1
kind: Pod
metadata:
  name: my-namepsace-demo
  namespace: my-namespace
spec:
  containers:
  - name: 
    my-container
    image: zerokoll/helloworld
```

The other option is to modify your `kubectl` configuration to target the namespace that you want to work with. This is done by running a command like this

```bash
kubectl config set-context --current --namespace=my-namespace
```

__Note:__ This will change the default namspace for `kubectl` for all future calls. So if you did want to look in the _default_ namespace, you would need to add `-n default`. Or change it back by re-running the above command with the namespace parameter set to `default`.

### Resource access between namespaces

Resources inside a namespace only see other resources inside the same namespace. However, there is one notable exception, and that is services.  And that makes sense as there are a lot of reasons why you would want to be able to call services in other namespaces. 

As we know, services get DNS records set up to make it easy to call them. In most cases, we just use the name of the service. However, in [the post about services](/yet-another-kubernetes-intro-part-4){:target=blank}, I mentioned that the DNS that gets set up actually consists of several parts. 

As long as you just want to talk to a service inside the current namespace, you only need the name of the service as a DNS name. But, when we introduce namespaces you can call services in other namespaces by adding the namespace name to the DNS like this `<SERVICE_NAME>.<NAMESPACE>`. So, if you are in the default namspace and want to call a service called `my-service` in the `my-namespace` namespace, the address would be `my-service.my-namespace`.

### Deleting a namespace

Another neat thing about using namespaces, at least for playing around with new things, is that you can easily delete a namespace, and everything inside it, by running

```bash
kubectl delete namespace my-namespace
```

## Role based access

Another quite important thing that I haven't covered this far is access control. And since this is a very important aspect, I think it needs to be covered, at least at a very basic level, even if this is just an introduction.

__Note:__ Yes, it is a somewhat hard switch from namespaces to RBAC. But as I said, this post needed to cover a couple of different things. On the other hand, you can use RBAC for namespace access. So let's say that that is the way that these topics are connected...

But before we can start talking about RBAC, we kind of need to have a small chat about users in Kubernetes. Mainly because I'm not properly covering that part in this intro. Why? Well, first off, because it is a bit complicated, involving cerificates and stuff. And secondly because it should be handled by someone that knows Kubernetes, and knows how to manage your cluster.

### Kubernetes users

Having that said, it is important to know that there are 2 types of users in K8s. Service accounts and "normal users". 

#### Normal users

Normal users are users that are handled by an external system. This can be achieved by using things like OpenID Connect, or some other form of authentication. In the end, it allows a user to authenticate against the K8s cluster by using client certificates, bearer tokens etc. But the users are not "part of" the cluster. 

For example, when using Azure AKS, you can use Azure AD to do the authentication, and then assign access based on the AD user accounts.

__Note:__ The authentication can be set up to use several different authentication mechanisms, such as OIDC, basic authentication and even static tokens. However, it requires you to have control over the start up of the `kube-api` service since the authentication configuration is passed to it as commandline parameters.

#### Service Accounts

Service accounts are users inside the cluster, managed by the cluster. These are generally used inside the cluster, by the resources running in it. These are much easier to set up, as they are set up inside the cluster using `kubectl`. Like this

```bash
kubectl create serviceaccount my-account
```

This creates a service account called `my-account`, which can then be assigned roles to control its access.

#### Accessing the cluster as a service account

To be able to play around with the things I am talking about in this post, it might be interesting to create a service account and then use that account to access the cluster.

__Note:__ Normally, you should use a normal user account when working with the cluster as an admin. But for demo purposes, and debugging, it can useful to authenticate as a service account.

Let's start by creating a new service account. I'll call mine `testaccount`

```bash
kubectl create serviceaccount testaccount
```

Once the account is created, we need to get an access token to be able to authenticate as this account. Luckily this is not too hard to do using `kubectl`. We just need to do the following. 

Start off by "getting" the account

```bash
kubectl get serviceaccount testaccount -o yaml
```

__Note:__ Adding `-o yaml` will give you more information about the resource in question. It will basically give you a YAML spec describing the resource.

In the output, locate the `secrets` entry with the name `testaccount-token-XXXXX`. This is the name of the secret that contains the token used for authentication. In my case, it was `testaccount-token-cgnrv`. With that information, it's time to get the token by "getting" the secret

```bash
kubectl get secret testaccount-token-cgnrv -o yaml
```

In the output from that command, you can see the token in clear text.

__Note:__There will be more talk about contexts and a few other `kubectl` things in the next post. Just accept the snippets for now.

Now that we have the access token, we need to tell `kubectl` to use it when authenticating. This is done by configuring a set of credentials for `kubectl` to use, using that token. This is done by executing

```bash
kubectl config set-credentials testcredentials --token=<TOKEN>
```

This command creates a set of credentials called `testcredentials`. To use them when running `kubectl` commands, we need to create a new "context" by running

```bash
kubectl config set-context testcontext --cluster=docker-desktop --user=testcredentials 
```

This will create a new "context" using the cluster named `docker-desktop` (assuming that you are using Docker Desktop), and the credentials we just created.

Finally, we need to tell `kubectl` that we want to use that context by executing

```bash
kubectl config use-context testcontext
```

Any command you run now, will run as the service account `testaccount`.

If you want to back to you regular user, just reset your context by running

```bash
kubectl config use-context docker-desktop
```

__Note:__ Assuming once again that you are using Docker Desktop...

### Kubernetes RBAC

Role based access in Kubernetes depends on a few types of resources. Mainly Role, ClusterRole, RoleBinding and ClusterRoleBinding, but there are more.

#### Roles

Role and ClusterRole resources contain a set of premissions. The difference is that a Role is defined for a specific namespace, and a ClusterRole is defined for the whole cluster and is valid in all namespaces.

__Note:__ Most resources are namespaced, but some, like `Node` for example aren't. Resources that are not namespaced can only be controlled using ClusterRoles, while namespaced resources can be controlled by both Role and ClusterRole.

To define a role, you can use a spec similar to this

```
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: default
  name: pod-manager
rules:
- apiGroups: [""] 
  resources: ["pods"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
```

This creates a role called `pod-manager`. It gives anyone that has been assigned the role full access to Pod resources in the _default_ namespace. 

Basically, a role contains a set of rules. Each rule defines what API groups they relate to, what resource types inside those API groups it relates to, and what HTTP verbs the user is allowed to use.

__Note:__ If you wanted to have a role with the same access, but gave the user the same permissions in all namespaces, you would just change the `kind` to `ClusterRole` and remove the `namespace` entry.

There are also built in roles that you can use. If you want to know which ones, you can run `kubectl get roles --all-namespaces` and `kubectl get clusterroles` to get a list of all the Role and ClusterRole resources available.

#### RoleBindings

Once you have a Role that you want to use, you need to assign it to a user. This is done using a RoleBinding or ClusterRoleBinding resource. 

Once again, the RoleBinding is namespace specific, and the ClusterRoleBinding is cluster wide.

A role binding looks something like this

```
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: testaccount-pod-manager
  namespace: default
subjects:
- kind: ServiceAccount
  name: testaccount
  namespace: default
roleRef:
  kind: Role
  name: pod-manager
  apiGroup: rbac.authorization.k8s.io
```

This RoleBinding definition creates a RoleBinding called `testaccount-pod-manager` that assigns the `pod-manager` role to the service account `testaccount` in the `default` namespace.

This will make sure that the service account `testaccount` is only allowed to play around with pods in the `default` namespace. All other resources will be off limits.

#### A sidenote for Docker Desktop

One thing to note though, is that if you are using Docker Desktop, and authenticate as `testaccount`, you are still allowed to do anything you want. That is because in Docker Desktop, they have added a ClusterRoleBinding that gives all service accounts full access for simplicity.

If you really want to try it out in Docker Desktop, you can remove the ClusterRoleBinding called `docker-for-desktop-binding` by running

```bash
kubectl delete clusterrolebinding docker-for-desktop-binding
```

This will reset the RBAC rules and limit the access as expected. Just remember that if you want to go back to the old way, which might be needed in some cases. You can do so by adding the ClusterRoleBinding back in using the following spec

```
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: docker-for-desktop-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- apiGroup: rbac.authorization.k8s.io
  kind: Group
  name: system:serviceaccounts
  namespace: kube-system
```

Just remember to switch back to a context where you have access to add it before you do. Otherwise adding the binding will fail for obvious reasons. Allowing a user with limited permissions to add role bindings would kind of defeat the purpose...

#### Summing up RBAC

There is a lot more to learn about Kubernetes RBAC. It has support for a lot more things like policies and groups and so on. But the general gist is that you create roles that have permissions. The roles are then assigned to a user or group. Pretty much what you would expect from an RBAC solution. And yeah, the permissions are based around HTTP verbs for spcific resources.

I'll let you dive deeper into this area on your own!
