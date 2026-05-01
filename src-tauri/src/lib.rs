use std::collections::HashMap;
use serde_json::{Value, Map};

#[tauri::command]
fn parse_dbf(path: String) -> Result<Value, String> {
    let mut reader = dbase::Reader::from_path(path).map_err(|e| e.to_string())?;
    let mut records = Vec::new();

    for record_result in reader.iter_records() {
        let record = record_result.map_err(|e| e.to_string())?;
        let mut map = Map::new();
        for (name, value) in record {
            let val_str = match value {
                dbase::FieldValue::Character(Some(s)) => s,
                dbase::FieldValue::Numeric(Some(f)) => f.to_string(),
                dbase::FieldValue::Logical(Some(b)) => b.to_string(),
                dbase::FieldValue::Date(Some(d)) => format!("{}-{}-{}", d.year(), d.month(), d.day()),
                dbase::FieldValue::Float(Some(f)) => f.to_string(),
                dbase::FieldValue::Integer(i) => i.to_string(),
                dbase::FieldValue::Double(d) => d.to_string(),
                _ => "".to_string(),
            };
            map.insert(name.to_string(), Value::String(val_str.trim().to_string()));
        }
        records.push(Value::Object(map));
    }

    Ok(Value::Array(records))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![parse_dbf])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
