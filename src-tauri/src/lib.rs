use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Extract plain text from Office/RTF/PDF files using macOS textutil
#[tauri::command]
async fn extract_text_from_file(path: String) -> Result<String, String> {
    let output = std::process::Command::new("textutil")
        .args(["-stdout", "-convert", "txt", &path])
        .output()
        .map_err(|e| format!("textutil not available: {e}"))?;
    if output.status.success() {
        String::from_utf8(output.stdout).map_err(|e| e.to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn invoke_bedrock(
    profile: String,
    region: String,
    model_id: String,
    messages: Vec<serde_json::Value>,
    max_tokens: u32,
) -> Result<String, String> {
    let sdk_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .profile_name(&profile)
        .region(aws_config::Region::new(region))
        .load()
        .await;

    let client = aws_sdk_bedrockruntime::Client::new(&sdk_config);

    let body = serde_json::json!({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "messages": messages
    });

    let response = client
        .invoke_model()
        .model_id(&model_id)
        .content_type("application/json")
        .accept("application/json")
        .body(aws_sdk_bedrockruntime::primitives::Blob::new(
            body.to_string().into_bytes(),
        ))
        .send()
        .await
        .map_err(|e| format!("Bedrock error: {e}"))?;

    let bytes = response.body().as_ref().to_vec();
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "notes",
            sql: include_str!("../migrations/002_notes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "wiki",
            sql: include_str!("../migrations/003_wiki.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "notes extracted_at",
            sql: include_str!("../migrations/004_notes_extracted.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "unescape note content corrupted by MDXEditor",
            sql: include_str!("../migrations/005_unescape_note_content.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "unescape wiki bracket escapes that broke wikilinks",
            sql: include_str!("../migrations/006_unescape_wiki_brackets.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .setup(|app| {
            // Set the dock/window icon explicitly so it shows in dev mode
            if let Some(icon) = app.default_window_icon().cloned() {
                for window in app.webview_windows().values() {
                    let _ = window.set_icon(icon.clone());
                }
            }
            Ok(())
        })
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:nexus.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![invoke_bedrock, extract_text_from_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
