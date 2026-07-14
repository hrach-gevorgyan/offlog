// LAN discovery — Track E (ROADMAP.md E1). Advertises this PC's embedded
// sync host over mDNS/DNS-SD so a phone never needs a typed IP: Android's
// side (a future NSD/zeroconf Capacitor plugin, not built yet) listens for
// `_offlog._tcp.local.` and shows "Found '<name>' — Connect?".
//
// Deliberately not broadcasting credentials in the TXT record — mDNS is
// a plaintext LAN broadcast, and anything in it is visible to every device
// on the network, trusted or not. Only the CouchDB server's own `uuid`
// (already public once someone knows the URL, since CouchDB's `GET /`
// returns it unauthenticated) and the pairing server's port go out —
// enough for a phone to find the right device and know where to send a
// pairing code, without ever seeing a secret over the air. See
// pairing.rs for the actual credential handshake this enables.

use mdns_sd::{ServiceDaemon, ServiceInfo};

const SERVICE_TYPE: &str = "_offlog._tcp.local.";

pub fn advertise(port: u16, server_uuid: &str, device_name: &str, pairing_port: u16) -> Option<ServiceDaemon> {
    let daemon = match ServiceDaemon::new() {
        Ok(d) => d,
        Err(e) => {
            log::error!("discovery: failed to start mDNS daemon: {e}");
            return None;
        }
    };

    let hostname = format!("{}.local.", device_name.replace(' ', "-"));
    let mut properties = std::collections::HashMap::new();
    properties.insert("uuid".to_string(), server_uuid.to_string());
    properties.insert("name".to_string(), device_name.to_string());
    properties.insert("pairing_port".to_string(), pairing_port.to_string());

    let instance_name = device_name.to_string();
    let service = match ServiceInfo::new(
        SERVICE_TYPE,
        &instance_name,
        &hostname,
        "", // let mdns-sd fill in this host's local IPs automatically
        port,
        properties,
    ) {
        Ok(s) => s.enable_addr_auto(),
        Err(e) => {
            log::error!("discovery: failed to build service info: {e}");
            return None;
        }
    };

    match daemon.register(service) {
        Ok(_) => {
            log::info!("discovery: advertising {SERVICE_TYPE} as \"{instance_name}\" on port {port}");
            Some(daemon)
        }
        Err(e) => {
            log::error!("discovery: failed to register mDNS service: {e}");
            None
        }
    }
}
