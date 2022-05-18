const dns2 = require( "dns2" );
const net = require( "net" );
/**
 * Virtual Hosting over TCP via Client IP Address-Correlated DNS Lookups
 * or Solving IPv4 Exhaustion with JavaScript
 *  
 * --------------
 * 
 * Full write-up on wtf this does available here: 
 * https://medium.com/@seansamarov/solving-ipv4-exhaustion-with-javascript-3846600ae64b
*/

const LOOKUPS = new Map(); // Correlates a client's IP address with the last domain they looked up.
const IP = "Your public IP should go here";
const PORT = 80; // Only listening on one port for the purposes of this demo, but since this is raw TCP, this would work for any and all TCP ports (provided you replaced this script with a program that could handle it). For this demonstration, I'm just using port 80 on a public interface as the client-facing reverse proxy, which proxies to two netcat instances running on port 80 on local interfaces.
const UPSTREAMS = new Map();
// Add our DNS records
UPSTREAMS.set( "vhost-1.samarov.me", "127.0.0.1" );
UPSTREAMS.set( "vhost-2.samarov.me", "10.0.0.1" );


/**
 * Reverse Proxy
 * 
 * Dynamically proxies TCP traffic to different upstreams, depending on what they looked up.
 */
//#region RP
const proxyServer = net.createServer();
proxyServer.listen( {
        host: IP,
        port: PORT,  // Using the same port everywhere for demo - see above.
    },
    () => {
        console.info( `Proxy server listening on ${ IP }:${ PORT }` );
    }
)
proxyServer.on( "connection", ( clientToProxySocket ) =>
{
    const CLIENT_IP = clientToProxySocket.remoteAddress;
    const DOMAIN_NAME = LOOKUPS.get( CLIENT_IP ); // Find the last domain they looked up with us
    const UPSTREAM_IP = UPSTREAMS.get( DOMAIN_NAME ); // Send them to the right upstream for that domain

    console.info( `Client ${ CLIENT_IP } connected to proxy. Connecting them to ${DOMAIN_NAME}.` );

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
        address: IP,
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
        address: IP // Point the client to our reverse proxy
    } );

    // Before sending the DNS response to the client, make sure the proxy is ready to recieve their connection.
    send( response );
} );

//#endregion DNS