const dns2 = require( "dns2" );
const net = require( "net" );
/**
 * Virtual Hosting over TCP via Client IP Address-Correlated DNS Lookups
 * or Solving IPv4 Exhaustion with JavaScript
 *  
 * --------------
 * 
 * This only works as long as we have their IP address. 
 * On the public internet, where the clients wouldn't be reaching this server directly 
 * but instead through a public DNS provider (Google's 8.8.8.8, Cloudflare's 1.1.1.1, etc.), 
 * we would need to rely on ECS (EDNS Client Subnet, includes a *portion* of the client's IP address in the DNS request - see RFC 7871 ). 
 * We would also need to be the authoritative DNS server for all domains we want to control and proxy, rather than "hardcoding" it as my local DNS server like I am.
 * 
 * In this case, we'd basically have to hope that - 
 * A. The client's DNS provider supports ECS (this isn't a guarantee - see https://en.wikipedia.org/wiki/EDNS_Client_Subnet#Controversy_over_lack_of_support).
 * B. The DNS records somehow aren't cached anywhere between us and the client, so we have full control over wh
 * C. The client is the only one making requests to domains we control from their subnet.
 * 
 * If one of their IP address "neighbors" were to also try to access one of our upstream services, 
 * our system would get them confused because we don't have their complete IP address.
 * 
 * 
 * TL;DR - This will absolutely never work in a production environment, it's nowhere near reliable. However, it is an interesting experiment in a controlled network environment.
*/

const LOOKUPS = new Map(); // Correlates a client's IP address with the last domain they looked up.
const PORT = 80; // This is just for testing obviously. My upstreams are all set to use this port, on different local IPs, for demonstration purposes.
const UPSTREAMS = new Map();
// Add our DNS records
UPSTREAMS.set( "vhost-1.samarov.me", "158.69.22.214" );
UPSTREAMS.set( "vhost-2.samarov.me", "158.69.22.214" );


/**
 * Reverse Proxy
 * 
 * Dynamically proxies TCP traffic to different upstreams, depending on what they looked up.
 */
//#region RP
const proxyServer = net.createServer();
proxyServer.listen( {
        host: "158.69.22.214",
        port: PORT,  // Only listening on one port, but technically since this is raw TCP, we should support all TCP ports, since the client might be trying to connect to any of them. For this demonstration, I'm just using port 127.0.0.1:8000 as the client-facing reverse proxy, which proxies to two netcat instances running on my PC - 192.168.1.129:8000 and 100.64.23.34:8000.
    },
    () => {
        console.info( `Proxy server listening on 158.69.22.214:${ PORT }` );
    }
)
proxyServer.on( "connection", ( clientToProxySocket ) =>
{
    const CLIENT_IP = clientToProxySocket.remoteAddress;
    const DOMAIN_NAME = LOOKUPS.get( CLIENT_IP ); // Find the last domain they looked up with us
    const UPSTREAM_IP = UPSTREAMS.get( DOMAIN_NAME ); // Send them to the right upstream for that domain

    console.info( `Client ${ CLIENT_IP } connected to proxy.` );

    clientToProxySocket.once( "data", ( data ) =>
    {
        const proxyToServerSocket = net.createConnection( {
            host: UPSTREAM_IP,
            port: PORT // Using the same port everywhere for demo - see above.
        } )
        clientToProxySocket.pipe( proxyToServerSocket );
        proxyToServerSocket.pipe( clientToProxySocket );
    })
})

//#endregion RP

/**
 * DNS Server
 */
//#region DNS
const dnsServer = dns2.createServer( { udp: true } );
dnsServer.listen( {
    udp: {
        port: 53,
        address: "158.69.22.214",
        type: "udp4"
    }
} )

dnsServer.on("request", ( request, send, rinfo ) =>
{
    // TODO Make sure this is a domain we actually control, otherwise just proxy the domain to a public DNS provider like normal. We should only generate results if we want to control the routing.
    const CLIENT_IP = rinfo.address;
    const DOMAIN_NAME = request.questions[ 0 ].name; // We correlate the domain they looked up with the corresponding backend. 
    LOOKUPS.set( CLIENT_IP, DOMAIN_NAME );
    /**
     *  Save the last domain they looked up with their IP address, 
     * so that the reverse proxy can find the last domain they looked 
     * up by their IP adress and proxy them to the right backend. 
     */
    
    console.info( `Client ${ CLIENT_IP } just looked up ${ DOMAIN_NAME }. Storing.` );

    const response = dns2.Packet.createResponseFromRequest( request );
    response.answers.push( {
        name: DOMAIN_NAME,
        type: dns2.Packet.TYPE.A,
        class: dns2.Packet.CLASS.IN,
        ttl: 0, // Important that we prevent caching as much as possible
        address: "158.69.22.214" // Point the client to our reverse proxy
    } );

    // Before sending the DNS response to the client, make sure the proxy is ready to recieve their connection.
    send( response );
} );

//#endregion DNS