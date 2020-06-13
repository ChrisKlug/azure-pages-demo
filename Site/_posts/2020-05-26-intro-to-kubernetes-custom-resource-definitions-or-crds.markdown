---
layout: post
current: post
cover:  /assets/images/covers/kubernetes-crd-intro.jpg
smallcover:  /assets/images/covers/kubernetes-crd-intro-small.jpg
navigation: True
title: Intro to Kubernetes Custom Resource Definitions or CRDs
date: 2020-05-14 15:49:00
tags: [kubernetes,aks,azure]
class: post-template
subclass: 'post'
author: zerokoll
---
After having done a couple of Kubernetes-based projects, I still haven't had time to dive into Kubernetes Custom Resource Definitions, or CRDs, properly. Because of this, I decided to play around with them a little outside of a real project to see what they are, and how I might be able to use them in future projects.

## What are Custom Resource Definitions?

Ok, so what are CRDs? Well, as you probably know, pretty much everything we create in Kubernetes is a resource. Whether it be a Pod, a Service, a Deployment or a Secret, it is, at it's most basic form, a resource. The resources are then often monitored by __Controllers__ that are responsible for taking the information in the resource and turning it in to something useful. 

Let's take a high-level look at what happens when you create for example a Pod resource. 

Whenever a Pod resource is added, changed or deleted, there is a controller (technically a _scheduler_ in the case or Pods, but let's ignore that) that that gets notified of the change. And whenever it sees a Pod resource being added or updated, it will look at the information in the resource and decide what to do with the new or updated information. In the case of a new Pod, it will figure out what node that should be responsible for running that workload, and assign it to that node. This assignment is then picked up by another controller on that node, which in turn makes sure to spin up the required containers.

This is the general gist for pretty much all things in Kubernetes. Someone adds, updates or deletes a resource, a controller sees the change, and acts on it. What "acts on it" means, is obviously dependent on what type of resource it is…

For all built in resource types like Pods, Services, Deployments etc, there are already controllers in place to handle them. But Kubernetes is not a static system. It is a very dynamic system, built around the idea that the users should be allowed to modify it to fit our needs. And one way to do that, is to use Custom Resource Definitions.

A CRD is just what it sounds like. It is a definition of a custom resource. It allows us to create our own resource types in the cluster, and extend what the cluster can do.

## What can CRDs be used for?

When it comes to the question "what can I use CRDs for?" the sky is kind of the limit. It all depends on your imagination. However, in general, it isn't really used for things like running containers for example. There are already resources for that inside Kubernetes, so we tend to use those instead. CRDs is generally  more about being able to manage "things" related to your application in the same way you manage your workloads inside your cluster. That is, being able to manage "things" bu adding resources to your cluster, even if the "thing" has zero knowlegde of Kubernetes. Basically, any time you feel like you need to create and manage some resource for your system, even if it isn't a native Kubernetes resource, a CRD might be an option. 

Imagine that you need to manage SSL certificates for your solution. In that case, maybe a custom "certificate" resource would be nice solution. It would allow you to define a certificate in the same way that you define other resources in your cluster, instead of having to manage certificate in a separate process that ultimately needs to tie into Kubernetes to work anyway… 

Or maybe you need to be able to dynamically create accounts in a 3rd party system. That could also be solved by creating a custom "3rd party account" resource definition that would allow you to manage those accounts as resources inside your cluster, instead of in a separate process outside the cluster.

## How do you create a CRD?

So, how do we go about creating Custom Resource Definitions? Well, there is a lot of advanced stuff to learn here, but let's stick with the basics.

A CRD is defined using a YAML file, just like you would when you define any other resource in K8s. Because…well…a Custom Resource Definition is a Resource in Kubernetes. Very meta!

In the simplest form, it looks like this

```
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: foos.demos.fearofoblivion.com
spec:
  scope: Namespaced
  group: demos.fearofoblivion.com
  names:
    kind: Foo
    singular: foo
    plural: foos
    # shortNames:
    # - foo
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          description: "A foo object"
          properties:
            spec:
              type: object
              properties:
                value1:
                  type: string
                  default: "Default value"
                value2:
                  type: string
                  pattern: "^[a-zA-Z0-9]+"
                value3:
                  type: integer
                value4:
                  type: integer
                  minimum: 1
                  maximum: 10
```

This definition creates a CRD called _foos.demos.fearofoblivion.com_ allowing us to create _Foo_ resources. Let's start from the top and see what the spec says.

__Note:__ The format of this sepc is dependent on the version of Kubernetes you are using. Docker Dektop just recently upgraded to version 1.16 from 1.15, so the above example is for 1.16. However, if you are on 1.15 or below, you need to make some changes. First of all, the `apiVersion` needs to be changed to `apiextensions.k8s.io/v1beta1`. Next you need to move the `openAPIV3Schema` from `spec.versions.schema` to `spec.validation`. And finally you need to check the features used by the schema, as this has changed a bit.

Next, it uses the `kind` and `metadata` fields to say that the spec contains a `CustomResourceDefinition` with the name _foos.demos.fearofoblivion.com_. And no, that complicated name is not something I just felt rolled naturally of my tongue… It has this long complicated name because Kubernetes requires it to conform to a specific format. It needs to be formatted as __&lt;plural&gt;.&lt;group&gt;__. And since I decided that the pluralized name for my `Foo` resource type should be _foos_, and that it should belong to a group called _demos.fearofoblivion.com_, the name becomes _foos.demos.fearofoblivion.com_.

Once you get past the type and name, you can see the `spec` field. This is where we specify the information about our CRD. 

The first field inside the spec in this case, is one called `scope`. This defines whether this resource is to be defined at a cluster level, or reside inside a namespace. In the case of Foo, I decided that it would make more sense inside a namespace.

Next up is `group` and `names` fileds, which I have already talked briefly about before, as they tie into the name of the CRD. 

The `group` is a logical grouping for the resource. It allows you to define CRDs without having to be afraid that the name will collide with other CRDs that you might be adding in the future. It's just a string, but it seems to be a standard practice to use a URL form.

Besides the `group`, you have a whole set of "names". First, you have a `kind`, which is the name you use when referring to the type. Then you have a `singular` which is genrally the `kind` in lower-case (it even defaults to this if you omit the field). And finally, you have a pluralized version in `plural`.

On top of that , you can also define short names that allow you to use shorter names when querying for resources using for example `kubectl`. However, __Foo__ is already very short, so it isn't really needed.

__Note:__ Why all the names? Well the group and names are used by the API to build up a path for the resources you will be creating. The path generated by the API is _/apis/&lt;group&gt;/&lt;version&gt;_

Once the names have been defined, there is information about resource versioning in the `versions` field. The `versions.name` field defines version name for this resource, allowing you to version your resources over time. Next, you can decide whether or not this version is still being served by the API. This is done by setting the `versions.served` field to true or false. And finally, you can define whether or not this is the format that should be used when storing resources, by setting the `versions.storage` field. 

The `versions` fields allow you to migrate to newer versions of the resource definition over time. It also has support for converting between different versions to allow you to serve both old and new versions. This is a bit beyond this blog post though…

Finally, we have gotten to the part where we define the contents of our custom resource. The `validation.openAPIV3Schema` field. This field contains an Open API v3 schema that allows us to define what properties should be available on our resources. In the case of __Foo__, I've set to be an _object_ with a simple description. The _object_ is defined to have a single property called `spec`, of the type object. The spec object in turn has 4 properties called `value1`, `value2`, `value3` and `value4`. The first 2 fields are strings, with the 1st one having a default value, and the 2nd one having a required pattern added to it. And the last 2 are integers, with the last one requiring the value to be between 1 and 10.

I'm not going to cover Open API v3 schemas at any depth here, but as you can see, it can be used to define the properties that the custom resources should have.

__Note:__ You can also tell it to save any provided values by setting `x-kubernetes-preserve-unknown-fields: true` in your schema, or `spec.preserveUnknownFields: true` if you are on 1.15. This will make sure that any provided value is preserved, even if they are missing from the schema.

There is a LOT of stuff to learn when it comes to specifying the properties for your custom resources, and it is all pretty well documented at https://kubernetes.io/docs/tasks/access-kubernetes-api/custom-resources/custom-resource-definitions/. So if you want to, you can head over there and read more about it in depth. If not, you now at least have a basic understanding of how you can create a CRD in Kubernetes.

## How to create resources based on a CRD?

Once you have added the above CRD to your cluster, you are all set to create Foo resources in your cluster. To do so, you just create a YAML-file that looks something like this

```
apiVersion: "demos.fearofoblivion.com/v1"
kind: Foo
metadata:
  name: a-foo
spec:
  value1: "Hello World!"
  value2: "This is awesome!"
  value3: 42
  value4: 5
```

And then adding it to your cluster by running 

```bash
kubectl apply -f ./a-foo.yaml
```

This will create a new Foo resource with the name __a-foo__ in your cluster. The resource will have its values set to the defined values as expected. And to make sure that that is the case, you can just "get it" from the cluster like any other resource like this

```bash
kubectl get foo a-foo -o yaml

apiVersion: demos.fearofoblivion.com/v1
kind: Foo
metadata:
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: |
      {"apiVersion":"demos.fearofoblivion.com/v1","kind":"Foo","metadata":{"annotations":{},"name":"a-foo","namespace":"default"},"spec":{"value1":"Hello World!","value2":"This is awesome!","value3":42,"value4":5}}
  creationTimestamp: "2020-05-22T22:10:12Z"
  generation: 1
  name: a-foo
  namespace: default
  resourceVersion: "1304839"
  selfLink: /apis/demos.fearofoblivion.com/v1/namespaces/default/foos/a-foo
  uid: 31c38ee2-9041-4a3e-ac0f-831f81e191ca
spec:
  value1: Hello World!
  value2: This is awesome!
  value3: 42
  value4: 5
```

And as you can see, there it is. A Foo resource in my cluster!

## Building a controller

So far, we have enabled the ability to add a custom resource to the cluster. But honestly, that is not very useful on its own.

To be able to actually do something with your new resource type, you need to create a controller that can use the information in the resource to do something. Luckily, this is actually pretty simple to do. All we need is a bit of code that watches the cluster for new, changed or deleted Foos, and then does whatever needs to be done whenever a Foo resource is added, updated or deleted.

Since I am a .NET Core developer, I decided to create an empty ASP.NET Core application for this. And inside the application I created a hosted service that can sit in the background of the application and monitor the cluster.

__Note:__ Most demos about building things for Kubernetes is using Go. And even if that is probably a great language, it is defintiely not a requirement. Most things are done using Docker containers, so any language that can support that should be ok!

Setting up the monitoring of the cluster is much easier than I would have expected. Even if I find that the C# Kubernetes client to be a little less than awesome… 

The first thing you need to do is to add the __KubernetesClient__ NuGet package to your project. Once that is done, you need to set it up to talk to the Kubernetes API. Just remember that there are 2 scenarios for this. The first one is when you are working on the code and need to debug it. And the second one is when the code is running inside the cluster. The reason that these are different is that the access to the API will differ. Luckily, this is easily sorted out with the following code though

```csharp
KubernetesClientConfiguration config;
if (KubernetesClientConfiguration.IsInCluster())
{
    config = KubernetesClientConfiguration.InClusterConfig();
}
else
{
    config = new KubernetesClientConfiguration { Host = "http://localhost:8001" };
}

var kubernetes = new Kubernetes(config);
```

__Note:__ When running "locally" you need to run `kubectl proxy` to proxy localhost port 8001 to the API. So make sure you run this before starting the application.

As soon as we have a Kubernetes client, we can talk to the cluster fairly easily. However, before we can start talking to the API, we need to create a couple of DTOs that allow us to deserialize the JSON responses from the API.

__Note:__ This is not stricly necessary, but if we don't, we need to traverse the JSON manually. And as this is tedious and error prone, I would recommend creating DTOs.

In this case, knowing what a Foo resource should look like, I added the following code

```
public class Foo
{
    public const string Group = "demos.fearofoblivion.com";
    public const string Version = "v1";
    public const string Plural = "foos";
    public const string Singular = "foo";

    public string ApiVersion { get; set; }
    public string Kind { get; set; }
    public V1ObjectMeta Metadata { get; set; }
    public FooSpec Spec { get; set; }

    public class FooSpec
    {
        public string Value1 { get; set; }
        public string Value2 { get; set; }
        public int Value3 { get; set; }
        public int Value4 { get; set; }
    }
}
```

As you can see, the `Foo` object is just a "dumb" object that mimics the response given back by the API, allowing us to deserialize the JSON into an object. However, I also added a couple of string constants to hold the name values from the CRD. This makes it easier to query for Foo resources without having to resort to "magic strings".

With the DTOs in place, talking to the API is very simple. All that is required are the following lines of code

```csharp
var fooListResponse = _kubernetes.ListNamespacedCustomObjectWithHttpMessagesAsync(Foo.Group, Foo.Version, "default", Foo.Plural, watch: true);

_watcher = fooListResponse.Watch<Foo, object>((type, item) => OnFooChange(type, item));
```

This code sets up a watcher that uses the API to look for any added, changed or deleted Foo resources in the _default_ namespace. Whenever a change happens, the OnFooChange method is called, which in turn can then do whatever is necessary depending on the type of change

```csharp
private Task OnFooChange(WatchEventType type, Foo item)
{
    switch (type)
    {
        case WatchEventType.Added:
            // TODO: Handle Foo being added
            return Task.CompletedTask;
        case WatchEventType.Modified:
            // TODO: Handle Foo being changed
            return Task.CompletedTask;
        case WatchEventType.Deleted:
            // TODO: Handle Foo being deleted
            return Task.CompletedTask;
    };
}
```

Just a small warning here! The `ListNamespacedCustomObjectWithHttpMessagesAsync` will give you an _Added_ notification for all existing resources when it starts up. So an _Added_ doesn't necessarily mean that the resource has just been added to the cluster. It can also mean that the resource was there when you set up the watch.

Once the code for the controller has been created, and works, we just need to package up our application as a Docker image and deploy it as a Pod in our cluster.

## Load balancing controllers

There is an interesting "problem" that rears its ugly face when you start creating controllers to monitor your custom resources. And that is scaling and availability. We pretty much always want to have more than one instance of our pods in case one is killed off, or moved. However, we really only want one controller managing our custom resources. Why? Well…we don't want to end up with multiple controllers trying to handle the same resource. That could cause a whole heap of problems.

So, how do we solve that? Well, a very common scenario is to have a "leader/follower" pattern that leaves us with a single leader that is responsible for doing the work, and one or more followers that take over if the leader goes away. This is a bit complicated to build in a good way on your own though… There are lots of little things that can go wrong. Luckily, there is already a Docker image available for this specific scenario at the Google Cloud Docker repo. It's called __leader-elector__. It is a sidecar container that is responsible for sorting out the leader selection for us. All we need to do is to deploy it as a sidecar container to our controller, and then we can just issue a simple HTTP GET request to figureout who who the leader.

To deploy it as a sidecar, we can just add it to our controller deployment like this

```
apiVersion: apps/v1
kind: Deployment
metadata:
  name: foo-controller
spec:
  replicas: 2
  selector:
    matchLabels:
      app: foo-controller
  template:
    metadata:
      labels:
        app: foo-controller
    spec:
      containers:
      - name: foo-controller
        image: zerokoll.azurecr.io/crd-demo
        ports:
        - containerPort: 80
        
      - name: leader-election
        image: "k8s.gcr.io/leader-elector:0.5"
        args:
        - --election=foo-election
        - --http=0.0.0.0:4040
        ports:
        - containerPort: 4040
```

As you can see, it is deployed as a second container called _leader_election_ in this case, exposing port 4040 inside the pod.

To see whether or not the current controller is the current leader, we just need to make an HTTP GET call to port 4040 on localhost, and see if the returned value contains the name of the current host. Like this

```csharp
var client = _httpClientFactory.CreateClient();
string response = await client.GetStringAsync(_endpoint);
var isLeader = response.Contains(_hostEnvironment.EnvironmentName);
```

__Note:__ The repsonse actually contains a JSON object with the name of the leader, but a simple `Contains` is all we really need... No need to parse JSON!

__Worth mentioning:__ This is a very simple way of doing it, and it seems to work pretty well. But remember that this is a blog post, and thus does not contain real production code. I would definitely use some more defensive programming, and have a deeper look at leader selection etc for a production system. There are a lot of edge cases that can cause problems in these kinds of scenarios. So I would probably want to make sure that my leader selection was stable if it was a crucial part of my system.

## Conclusion

CRDs can be a very powerful addition to your Kubernetes toolbelt. It allows us to extend the functionality of our cluster to support the management of any form of resources that we might need to handle in our solution. At least as long as we can figure out a way to build a controller that does the heavy lifting then a resource is added.

Custom resources could obviously also be used to store any form of data that you might want to store inside the cluster. However, I personally think that you are better off using ConfigMaps and Secrets for that kind of data storage. And if you need to store things that aren't configuration and secrets, then it should probably be stored in some other store…like a database... But that's just my personal opinion.

I am well aware of the fact that this post was very heavy on text, and pretty light on code. But there is actual code available as well. It just happens to be a bit more complex than I wanted to show off in a blog post like this. On top of that, it ended up covering a few things that weren't really covered in this post. So I would definitely recommend heading over to https://github.com/ChrisKlug/k8s.demos.crd and having a poke around in the code if you found the content of the post interesting. 

That's it for this time! I hope you found it somewhat interesting and useful! 
