use reqwest::Client;

#[tokio::main]
async fn main() {
    let client = Client::new();
    let url = "https://raw.githubusercontent.com/gustavo-keiller/ZzzModManager-DB/main/images/Agent Anby Demara Portrait.png";
    let res = client.get(url).send().await;
    match res {
        Ok(r) => println!("Status: {}", r.status()),
        Err(e) => println!("Error: {}", e),
    }
}
