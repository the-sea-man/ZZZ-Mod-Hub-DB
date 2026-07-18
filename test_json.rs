use serde_json::Value;

fn main() {
    let json_str = r#"{"characters": [{"id": "anby"}]}"#;
    let mut parsed: Value = serde_json::from_str(json_str).unwrap();
    let category = "playable_characters";
    
    let items = if parsed.is_array() {
        parsed.take()
    } else if let Some(Value::Array(arr)) = parsed.get_mut(category).map(|c| c.take()) {
        Value::Array(arr)
    } else if let Some(Value::Array(arr)) = parsed.get_mut("characters").map(|c| c.take()) {
        Value::Array(arr)
    } else {
        Value::Array(vec![])
    };
    
    println!("{:?}", items);
}
