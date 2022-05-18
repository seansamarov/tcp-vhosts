# ???
This is a demo script of a scheme to provide what is effectively SNI for any TCP connection. For a full description, please [see the Medium article](https://medium.com/@seansamarov/solving-ipv4-exhaustion-with-javascript-3846600ae64b "Solving IPv4 Exhaustion with JavaScript").

# Can I try it?
Yes. For a limited time, the following commands will demonstrate the concept:

```bash
dig @ns1.samarov.me vhost-1.samarov.me # Tell the server which service we're looking for. This is done explicitly here, but obviously the DNS query would be done implicitly in the following lines.

nc vhost-1.samarov.me 80 # Connect to the server. Expect that it knows we're looking for vhost-1 and that it'll return "This is upstream 1, vhost-1.samarov.me"

dig @ns1.samarov.me vhost-2.samarov.me 

nc vhost-2.samarov.me 80 # Connect to the other service. DNS caching usually breaks this, but if it were to work properly, it would return "This is upstream 2, vhost-2.samarov.me".
```