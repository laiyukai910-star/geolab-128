use geolab_server::{AppState, app};
use serde::Serialize;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use tracing_subscriber::EnvFilter;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadyMessage {
    event: &'static str,
    url: String,
    pid: u32,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("geolab_server=info,tower_http=info")),
        )
        .with_writer(std::io::stderr)
        .init();
    let port = parse_port()?;
    let listener =
        tokio::net::TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port))
            .await?;
    let address = listener.local_addr()?;
    let ready = ReadyMessage {
        event: "ready",
        url: format!("http://{address}"),
        pid: std::process::id(),
    };
    println!("{}", serde_json::to_string(&ready)?);
    tracing::info!(%address, "GeoLab Rust computation service ready");
    axum::serve(listener, app(AppState::new(default_concurrency())))
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

fn parse_port() -> Result<u16, Box<dyn std::error::Error>> {
    let mut arguments = std::env::args().skip(1);
    let mut port = 0u16;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--port" => {
                let value = arguments.next().ok_or("--port requires a value")?;
                port = value.parse()?;
            }
            "--version" => {
                println!("geolab-server {}", env!("CARGO_PKG_VERSION"));
                std::process::exit(0);
            }
            unknown => return Err(format!("unknown argument: {unknown}").into()),
        }
    }
    Ok(port)
}

fn default_concurrency() -> usize {
    std::thread::available_parallelism()
        .map(|parallelism| (parallelism.get() / 2).clamp(1, 4))
        .unwrap_or(1)
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
