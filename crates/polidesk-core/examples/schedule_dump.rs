// Parse timetable text files and print the events as JSON (used to compare with polimi-schedule-js).
fn main() {
    let mut out = serde_json::Map::new();
    for f in std::env::args().skip(1) {
        let text = std::fs::read_to_string(&f).unwrap();
        let (ev, err) = polidesk_core::schedule::parse_text(&text);
        let name = std::path::Path::new(&f).file_name().unwrap().to_string_lossy().to_string();
        out.insert(name, serde_json::json!({ "data": ev.iter().map(|e| e.to_json("")).collect::<Vec<_>>(), "error": err }));
    }
    println!("{}", serde_json::Value::Object(out));
}
