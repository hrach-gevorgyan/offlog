// LAN discovery. Advertises this PC's embedded sync host over mDNS/DNS-SD
// so a phone never needs a typed IP; the client side browses for
// `_offlog._tcp.local.`.
//
// Never put credentials in the TXT record. mDNS is a plaintext LAN
// broadcast visible to every device on the network, trusted or not. Only
// the sync server's `uuid` (already public to anyone who knows the URL,
// since `GET /` returns it unauthenticated), the device name, and the
// pairing server's port go out — enough for a phone to find the right
// device and know where to send a pairing code, without any secret going
// over the air. pairing.rs carries the actual credential handshake.

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::time::{Duration, Instant};

const SERVICE_TYPE: &str = "_offlog._tcp.local.";

#[derive(serde::Serialize, Clone)]
pub struct OtherHost {
    pub uuid: String,
    pub name: String,
}

// `sync_host.rs` always spawns its own NyxDB sidecar, with no check for an
// existing host on the network, so two PCs on one LAN become two
// independent islands. This detects that situation so the frontend can
// warn about it; it does not change the spawn behavior (there is no
// "join as client instead" mode).
//
// Must run once at startup *before* this instance advertises itself, so
// it can only see genuinely other hosts and never a self-echo.
pub fn browse_for_others(timeout: Duration, exclude_uuid: &str) -> Vec<OtherHost> {
    let daemon = match ServiceDaemon::new() {
        Ok(d) => d,
        Err(e) => {
            log::warn!("discovery: browse_for_others failed to start daemon: {e}");
            return Vec::new();
        }
    };
    let receiver = match daemon.browse(SERVICE_TYPE) {
        Ok(r) => r,
        Err(e) => {
            log::warn!("discovery: browse_for_others failed to browse: {e}");
            return Vec::new();
        }
    };
    let mut found = Vec::new();
    let deadline = Instant::now() + timeout;
    loop {
        let remaining = match deadline.checked_duration_since(Instant::now()) {
            Some(d) if !d.is_zero() => d,
            _ => break,
        };
        match receiver.recv_timeout(remaining) {
            Ok(ServiceEvent::ServiceResolved(info)) => {
                let props = info.get_properties();
                let uuid = props.get_property_val_str("uuid").unwrap_or_default();
                if uuid.is_empty() || uuid == exclude_uuid || found.iter().any(|h: &OtherHost| h.uuid == uuid) {
                    continue;
                }
                let name = props.get_property_val_str("name").unwrap_or_else(|| info.get_fullname()).to_string();
                found.push(OtherHost { uuid: uuid.to_string(), name });
            }
            Ok(_) => continue,
            Err(_) => break, // timeout or channel closed
        }
    }
    let _ = daemon.stop_browse(SERVICE_TYPE);
    let _ = daemon.shutdown();
    found
}

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
