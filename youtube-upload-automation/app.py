import os
import json
import time
import glob
from datetime import datetime, date, time as dtime, timedelta, timezone
from zoneinfo import ZoneInfo
import pandas as pd
import streamlit as st
import google.generativeai as genai

# YouTube Google Client Imports
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request

# ==============================================================================
# 0. CONFIGURATION & CONSTANTS
# ==============================================================================
HISTORY_FILE = "history.json"
STAGING_DIR = "staging_area"
METADATA_FILE = os.path.join(STAGING_DIR, "metadata.json")
SCHEDULE_CONFIG_FILE = "schedule_config.json"
DEFAULT_INFO_FILE = "default_information.json"
STATIC_DESCRIPTION = "Thanks for watching! Subscribe for more."
CLIENT_SECRETS_FILE = "client_secrets.json"
TOKEN_FILE = "token.json"
YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

INITIAL_DEFAULT_INFO = {
    "title": "Amazing Video Highlights | Must Watch!",
    "description": "Thanks for watching! Make sure to like, comment, and subscribe for more daily videos.",
    "hashtags": "#Shorts, #Viral, #Trending, #YouTubeShorts, #Reels",
    "tags": "shorts, viral video, trending, youtube shorts, entertainment, highlights"
}

DEFAULT_TIMEZONES = {
    "America/New_York": ["12:00", "18:00", "00:00", "06:00", "15:00"],
    "America/Los_Angeles": ["12:00", "18:00", "00:00", "06:00", "15:00"],
    "UTC": ["12:00", "18:00", "00:00", "06:00", "15:00"],
    "Europe/London": ["12:00", "18:00", "00:00", "06:00", "15:00"],
    "Asia/Kolkata": ["12:00", "18:00", "00:00", "06:00", "15:00"]
}

DEFAULT_SCHEDULE_CONFIG = {
    "last_selected_timezone": "America/New_York",
    "target_timezone": "America/New_York",
    "slots": ["12:00", "18:00", "00:00", "06:00", "15:00"],
    "timezones": DEFAULT_TIMEZONES
}

KEY_TARGET_TIMEZONES = [
    "America/New_York",
    "America/Los_Angeles",
    "UTC",
    "Europe/London",
    "Asia/Kolkata"
]

TIMEZONE_DISPLAY_NAMES = {
    "America/New_York": "America/New_York (US Eastern)",
    "America/Los_Angeles": "America/Los_Angeles (US Pacific)",
    "UTC": "UTC",
    "Europe/London": "Europe/London (GMT/BST)",
    "Asia/Kolkata": "Asia/Kolkata (IST)"
}

# Streamlit Page Setup (Wide Layout)
st.set_page_config(
    page_title="YouTube Upload Automation Pipeline",
    page_icon="🎬",
    layout="wide",
    initial_sidebar_state="expanded",
)

api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)


# ==============================================================================
# PERSISTENT CONFIGURATION: SCHEDULE CONFIG (schedule_config.json)
# ==============================================================================
def load_schedule_config():
    """Loads saved schedule settings (timezone and per-timezone 5 time slots) or initializes defaults."""
    if not os.path.exists(SCHEDULE_CONFIG_FILE):
        save_schedule_config(DEFAULT_SCHEDULE_CONFIG)
        return DEFAULT_SCHEDULE_CONFIG
    try:
        with open(SCHEDULE_CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

            # Ensure timezones dictionary exists
            if not isinstance(data.get("timezones"), dict):
                data["timezones"] = {}

            # Fill missing timezones with default slots
            for tz in KEY_TARGET_TIMEZONES:
                if tz not in data["timezones"] or not isinstance(data["timezones"][tz], list) or len(data["timezones"][tz]) < 5:
                    data["timezones"][tz] = ["12:00", "18:00", "00:00", "06:00", "15:00"]

            # Identify last selected timezone
            last_tz = data.get("last_selected_timezone") or data.get("target_timezone")
            if last_tz not in KEY_TARGET_TIMEZONES:
                last_tz = KEY_TARGET_TIMEZONES[0]
            data["last_selected_timezone"] = last_tz
            data["target_timezone"] = last_tz
            data["slots"] = data["timezones"][last_tz]
            return data
    except Exception as e:
        st.warning(f"Could not read {SCHEDULE_CONFIG_FILE}, reverting to defaults: {e}")
        return DEFAULT_SCHEDULE_CONFIG


def save_schedule_config(config_data):
    """Persists timezone and per-timezone custom slot times into schedule_config.json."""
    try:
        with open(SCHEDULE_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=2)
    except Exception as e:
        st.error(f"Error saving {SCHEDULE_CONFIG_FILE}: {e}")


def parse_time_str(time_str):
    """Converts 'HH:MM' string to datetime.time object."""
    try:
        parts = time_str.split(":")
        return dtime(hour=int(parts[0]), minute=int(parts[1]))
    except Exception:
        return dtime(hour=12, minute=0)


# ==============================================================================
# HELPER FUNCTIONS: HISTORY & METADATA STORAGE
# ==============================================================================
def load_history():
    """Reads and returns the list of processed records from history.json."""
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception as e:
        st.error(f"Error reading {HISTORY_FILE}: {e}")
        return []


def update_history(new_entries):
    """Appends newly processed or uploaded files to history.json."""
    history = load_history()
    history.extend(new_entries)
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        st.error(f"Error writing to {HISTORY_FILE}: {e}")


def load_staging_metadata():
    """Reads metadata.json from staging_area/."""
    if not os.path.exists(METADATA_FILE):
        return []
    try:
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception as e:
        st.error(f"Error reading {METADATA_FILE}: {e}")
        return []


def save_metadata_to_staging(metadata_list):
    """Saves the metadata list as JSON inside staging_area/metadata.json."""
    os.makedirs(STAGING_DIR, exist_ok=True)
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata_list, f, indent=2)


def clear_staging_area():
    """Empties all video files and metadata.json inside the staging_area folder."""
    if os.path.exists(STAGING_DIR):
        for f in glob.glob(os.path.join(STAGING_DIR, "*")):
            try:
                os.remove(f)
            except Exception as e:
                st.warning(f"Could not delete {f}: {e}")


def load_default_info():
    """Reads default_information.json or returns default template."""
    if os.path.exists(DEFAULT_INFO_FILE):
        try:
            with open(DEFAULT_INFO_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {
                    "title": data.get("title", INITIAL_DEFAULT_INFO["title"]),
                    "description": data.get("description", INITIAL_DEFAULT_INFO["description"]),
                    "hashtags": data.get("hashtags", INITIAL_DEFAULT_INFO["hashtags"]),
                    "tags": data.get("tags", INITIAL_DEFAULT_INFO["tags"])
                }
        except Exception as e:
            pass
    return dict(INITIAL_DEFAULT_INFO)


def save_default_info(info_dict):
    """Saves default information to default_information.json."""
    with open(DEFAULT_INFO_FILE, "w", encoding="utf-8") as f:
        json.dump(info_dict, f, indent=2)


# ==============================================================================
# STRICT VIDEO-TO-SLOT DIRECT SCHEDULING LOGIC
# ==============================================================================
def calculate_slot_schedule(start_date, time_slots, timezone_name, count, auto_advance_past=False):
    """
    Direct Video-to-Slot Mapping (Strictly maps each video to fixed static slot times):
      * Video 1 -> Selected Start Date + Saved Slot 1 Time (for selected timezone)
      * Video 2 -> Selected Start Date + Saved Slot 2 Time (for selected timezone)
      * Video 3 -> Selected Start Date + Saved Slot 3 Time (for selected timezone)
      * Video 4 -> Selected Start Date + Saved Slot 4 Time (for selected timezone)
      * Video 5 -> Selected Start Date + Saved Slot 5 Time (for selected timezone)
    Converts each assigned local date/time combination into ISO 8601 UTC format
    (YYYY-MM-DDTHH:MM:SSZ) based on the target timezone for YouTube publishAt payload.
    Validates against YouTube criteria (scheduled publishing time must be at least 5 minutes in the future).
    """
    try:
        tz = ZoneInfo(timezone_name)
    except Exception:
        tz = ZoneInfo("UTC")

    schedule_list = []
    now_utc = datetime.now(timezone.utc)

    for i in range(count):
        slot_idx = i % len(time_slots)
        day_offset = i // len(time_slots)
        publish_date = start_date + timedelta(days=day_offset)
        slot_time = time_slots[slot_idx]

        # Combine Start Date directly with the fixed static Slot Time
        naive_dt = datetime.combine(publish_date, slot_time)
        localized_dt = naive_dt.replace(tzinfo=tz)
        utc_dt = localized_dt.astimezone(timezone.utc)

        # YouTube criteria check: publishAt must be at least 5 minutes in the future
        is_past = utc_dt <= (now_utc + timedelta(minutes=5))

        # Auto-advance past slot to next day if enabled
        if auto_advance_past and is_past:
            publish_date = publish_date + timedelta(days=1)
            naive_dt = datetime.combine(publish_date, slot_time)
            localized_dt = naive_dt.replace(tzinfo=tz)
            utc_dt = localized_dt.astimezone(timezone.utc)
            is_past = utc_dt <= (now_utc + timedelta(minutes=5))

        utc_iso = utc_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        local_date_str = publish_date.strftime("%Y-%m-%d")
        local_time_str = slot_time.strftime("%I:%M %p")
        local_display = f"{publish_date.strftime('%a, %b %d, %Y')} at {local_time_str} ({timezone_name})"

        schedule_list.append({
            "slot_name": f"Slot {slot_idx + 1}",
            "publish_date": local_date_str,
            "local_time": local_time_str,
            "local_display": local_display,
            "utc_iso": utc_iso,
            "localized_dt": localized_dt,
            "utc_dt": utc_dt,
            "is_valid_youtube": not is_past,
            "minutes_from_now": int((utc_dt - now_utc).total_seconds() // 60)
        })

    return schedule_list


# ==============================================================================
# AGENT 1: FILE STAGING & HISTORY MANAGER
# ==============================================================================
def stage_uploaded_files(uploaded_files):
    """Saves in-memory uploaded MP4 files into staging_area/ and logs to history.json."""
    os.makedirs(STAGING_DIR, exist_ok=True)
    staged_paths = []
    new_history_records = []

    for uploaded_file in uploaded_files:
        dest_path = os.path.join(STAGING_DIR, uploaded_file.name)
        with open(dest_path, "wb") as f:
            f.write(uploaded_file.getbuffer())
        staged_paths.append(dest_path)

        new_history_records.append({
            "filename": uploaded_file.name,
            "processed_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "status": "Staged & AI Analyzed"
        })

    if new_history_records:
        update_history(new_history_records)

    return staged_paths, new_history_records


# ==============================================================================
# AGENT 2: AI METADATA GENERATOR (GEMINI 1.5 PRO)
# ==============================================================================
def generate_metadata_for_video(video_path, model):
    """
    Uploads a staged video to the Gemini File API.
    Gemini multimodal model processes the actual visual frames of the video,
    and returns catchy Title (<70 chars), Hashtags, and Tags in valid JSON.
    """
    st.write(f"Uploading `{os.path.basename(video_path)}` to Gemini File API...")
    video_file = genai.upload_file(path=video_path)

    with st.spinner(f"Waiting for Gemini visual processor: {video_file.name}..."):
        while video_file.state.name == "PROCESSING":
            time.sleep(2)
            video_file = genai.get_file(video_file.name)

        if video_file.state.name == "FAILED":
            raise ValueError(f"Gemini File API processing failed for {video_path}")

    st.write("Analyzing visual video frames with Gemini 1.5 Pro...")
    prompt = (
        "Analyze this video's visual content. Generate a response in strictly valid "
        "JSON format with three fields: "
        "1. 'title': a catchy YouTube title under 70 characters. "
        "2. 'hashtags': a list of 5 to 7 trending hashtags starting with '#'. "
        "3. 'tags': a list of 5 to 7 standard YouTube tags (comma-separated keywords, NO '#' symbols)."
    )

    try:
        response = model.generate_content(
            [video_file, prompt],
            generation_config={"response_mime_type": "application/json"}
        )

        raw_text = response.text.strip()
        parsed_data = json.loads(raw_text)

        title = parsed_data.get("title", f"Video {os.path.basename(video_path)}")
        hashtags = parsed_data.get("hashtags", [])
        tags = parsed_data.get("tags", [])

        clean_hashtags = [h if h.startswith("#") else f"#{h}" for h in hashtags]
        clean_tags = [t.lstrip("#").strip() for t in tags]

        metadata_entry = {
            "filename": os.path.basename(video_path),
            "title": title,
            "description": STATIC_DESCRIPTION,
            "hashtags": clean_hashtags,
            "tags": clean_tags,
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        return metadata_entry

    finally:
        try:
            genai.delete_file(video_file.name)
            st.write(f"Cleaned up remote file `{video_file.name}` from Gemini File API.")
        except Exception as cleanup_err:
            st.warning(f"Could not delete remote Gemini file: {cleanup_err}")


# ==============================================================================
# AGENT 3: YOUTUBE UPLOADER & SCHEDULER (YOUTUBE DATA API V3)
# ==============================================================================
def get_authenticated_youtube_service():
    """
    Authenticates with YouTube Data API v3 using OAuth 2.0.
    Checks for token.json or client_secrets.json.
    Raises FileNotFoundError or Exception if credentials are invalid or missing.
    """
    if not os.path.exists(CLIENT_SECRETS_FILE) and not os.path.exists(TOKEN_FILE):
        raise FileNotFoundError("Missing client_secrets.json in root folder.")

    creds = None
    if os.path.exists(TOKEN_FILE):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, YOUTUBE_SCOPES)
        except Exception:
            creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CLIENT_SECRETS_FILE):
                raise FileNotFoundError("Missing client_secrets.json in root folder.")
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS_FILE, YOUTUBE_SCOPES)
            creds = flow.run_local_server(port=0)

        with open(TOKEN_FILE, "w", encoding="utf-8") as token_out:
            token_out.write(creds.to_json())

    return build("youtube", "v3", credentials=creds)


def upload_single_video_to_youtube(youtube, video_file_path, title, description, hashtags, tags, publish_at_utc_iso):
    """Uploads an MP4 file with scheduled publishing time to YouTube."""
    full_description = f"{description}\n\n" + " ".join(hashtags)

    body = {
        "snippet": {
            "title": title[:100],
            "description": full_description,
            "tags": tags,
            "categoryId": "28"  # Science & Technology (or 22: People & Blogs)
        },
        "status": {
            "privacyStatus": "private",
            "publishAt": publish_at_utc_iso,
            "selfDeclaredMadeForKids": False
        }
    }

    media = MediaFileUpload(
        video_file_path,
        mimetype="video/mp4",
        resumable=True,
        chunksize=-1
    )

    request = youtube.videos().insert(
        part="snippet,status",
        body=body,
        media_body=media
    )

    response = None
    while response is None:
        status, response = request.next_chunk()

    video_id = response.get("id")
    return video_id


# ==============================================================================
# MULTI-PAGE NAVIGATION & MAIN APPLICATION
# ==============================================================================
def main():
    # Load persistent schedule configuration
    schedule_cfg = load_schedule_config()

    # Sidebar Navigation
    st.sidebar.title("🎬 Automation Hub")
    st.sidebar.caption("YouTube Video Automation Pipeline")

    view_selection = st.sidebar.radio(
        "Select Pipeline View:",
        [
            "View 1: Video Staging & AI Metadata (Agents 1 & 2)",
            "View 2: YouTube Uploader & Scheduler (Agent 3)"
        ],
        index=0
    )

    st.sidebar.markdown("---")
    st.sidebar.markdown("### 📊 Status & Storage")
    active_tz_name = schedule_cfg.get("last_selected_timezone", schedule_cfg.get("target_timezone", "America/New_York"))
    st.sidebar.info(f"Persistent config: `{SCHEDULE_CONFIG_FILE}`\nTarget TZ: `{active_tz_name}`")

    st.sidebar.markdown("---")
    st.sidebar.markdown("### 📜 Upload History")
    sidebar_history_records = load_history()
    st.sidebar.caption(f"Logged upload entries: **{len(sidebar_history_records)}**")
    confirm_wipe_sidebar = st.sidebar.checkbox("Confirm wipe", key="sidebar_confirm_wipe")
    clear_history_sidebar_btn = st.sidebar.button(
        "Clear Upload History",
        type="secondary",
        disabled=not confirm_wipe_sidebar,
        key="sidebar_clear_history_btn",
        use_container_width=True
    )
    if clear_history_sidebar_btn:
        if confirm_wipe_sidebar:
            with open(HISTORY_FILE, "w", encoding="utf-8") as f:
                json.dump([], f, indent=2)
            st.sidebar.success("Upload history cleared.")
            st.rerun()

    # ==========================================================================
    # VIEW 1: AGENT 1 & AGENT 2 (STAGING & AI METADATA GENERATION)
    # ==========================================================================
    if view_selection.startswith("View 1"):
        st.title("🎬 Phase 1: Video Staging & AI Metadata")
        st.markdown(
            "Upload MP4 video files. Gemini 1.5 Pro analyzes visual scenes to extract "
            "catchy Titles, trending #Hashtags, and YouTube Tags."
        )

        if not api_key:
            st.warning(
                "⚠️ **GEMINI_API_KEY** is not detected in your environment. "
                "Please ensure it is configured to run AI metadata generation."
            )

        # Initialize session state for editable metadata
        if "metadata_df" not in st.session_state:
            cached_meta = load_staging_metadata()
            if cached_meta:
                rows = []
                for item in cached_meta:
                    rows.append({
                        "Filename": item.get("filename", ""),
                        "Generated Title": item.get("title", ""),
                        "Description": item.get("description", STATIC_DESCRIPTION),
                        "Hashtags": ", ".join(item.get("hashtags", [])) if isinstance(item.get("hashtags"), list) else str(item.get("hashtags", "")),
                        "Tags": ", ".join(item.get("tags", [])) if isinstance(item.get("tags"), list) else str(item.get("tags", "")),
                    })
                st.session_state["metadata_df"] = pd.DataFrame(rows)
            else:
                st.session_state["metadata_df"] = None

        col1, col2 = st.columns([1, 2.5], gap="large")

        # LEFT COLUMN: History Tracker
        with col1:
            st.subheader("📜 History Tracker")
            st.caption("Previously processed files from `history.json`")

            history_records = load_history()
            if history_records:
                history_df = pd.DataFrame(history_records)
                st.dataframe(history_df, use_container_width=True, hide_index=True)
                st.metric("Total Historical Records", len(history_records))

                with st.expander("🗑️ Manage / Remove History", expanded=False):
                    # Remove individual item
                    filenames = [f"{i+1}. {r.get('filename', 'Unknown')} ({r.get('processed_at', '')[:10]})" for i, r in enumerate(history_records)]
                    selected_to_remove = st.selectbox("Select entry to remove:", options=filenames, key="remove_single_history_select")
                    if st.button("❌ Remove Selected Entry", key="remove_single_history_btn"):
                        idx_to_remove = filenames.index(selected_to_remove)
                        history_records.pop(idx_to_remove)
                        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
                            json.dump(history_records, f, indent=2)
                        st.success("Selected entry removed from history.")
                        st.rerun()

                    st.markdown("---")
                    st.caption("Wipe entire history:")
                    confirm_wipe_main = st.checkbox("Confirm wipe all history", key="main_confirm_wipe")
                    clear_main_btn = st.button("Clear All History", type="secondary", disabled=not confirm_wipe_main, key="main_clear_history_btn")
                    if clear_main_btn and confirm_wipe_main:
                        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
                            json.dump([], f, indent=2)
                        st.success("Upload history cleared.")
                        st.rerun()
            else:
                st.info("No processing history yet.")

        # RIGHT COLUMN: Video Staging & Generation
        with col2:
            st.subheader("📤 Video Upload & Batch Processing")

            uploaded_files = st.file_uploader(
                "Drag and drop MP4 video files here, or click to browse",
                type=["mp4"],
                accept_multiple_files=True
            )

            if uploaded_files:
                st.info(f"{len(uploaded_files)} file(s) selected for staging.")

            process_button = st.button(
                "🚀 Process & Generate Metadata",
                type="primary",
                disabled=(not uploaded_files or not api_key)
            )

            if process_button:
                if not uploaded_files:
                    st.error("Please upload at least one .mp4 file before running.")
                    return

                st.write("---")
                progress_bar = st.progress(0)
                status_placeholder = st.empty()

                # Step 1: Agent 1 - Staging
                status_placeholder.info("Agent 1: Saving MP4s to staging_area/ and updating history.json...")
                staged_paths, new_records = stage_uploaded_files(uploaded_files)
                st.success(f"Agent 1: Staged {len(staged_paths)} video(s) into `{STAGING_DIR}/`.")

                # Step 2: Agent 2 - Gemini Visual Analysis
                status_placeholder.info("Agent 2: Initializing Gemini 1.5 Pro model...")
                model = genai.GenerativeModel("gemini-1.5-pro")

                generated_metadata_batch = []
                for idx, video_path in enumerate(staged_paths):
                    status_placeholder.info(
                        f"Agent 2: Analyzing [{idx + 1}/{len(staged_paths)}] {os.path.basename(video_path)}..."
                    )
                    try:
                        meta = generate_metadata_for_video(video_path, model)
                        generated_metadata_batch.append(meta)
                    except Exception as err:
                        st.error(f"Failed processing {os.path.basename(video_path)}: {err}")

                    progress_bar.progress((idx + 1) / len(staged_paths))

                # Step 3: Save to staging_area/metadata.json
                if generated_metadata_batch:
                    save_metadata_to_staging(generated_metadata_batch)
                    status_placeholder.success("Batch metadata generation complete! Staged for View 2.")

                    table_rows = []
                    for item in generated_metadata_batch:
                        table_rows.append({
                            "Filename": item["filename"],
                            "Generated Title": item["title"],
                            "Description": item["description"],
                            "Hashtags": ", ".join(item["hashtags"]) if isinstance(item["hashtags"], list) else str(item["hashtags"]),
                            "Tags": ", ".join(item["tags"]) if isinstance(item["tags"], list) else str(item["tags"]),
                        })
                    st.session_state["metadata_df"] = pd.DataFrame(table_rows)

            # Editable Table (st.data_editor)
            if st.session_state.get("metadata_df") is not None and not st.session_state["metadata_df"].empty:
                st.write("---")

                # Default Information Configuration (defaultinformation)
                default_info = load_default_info()
                with st.expander("📋 Default Information Settings (`defaultinformation`)", expanded=False):
                    st.caption(
                        "Set fixed Default Title, Description, Hashtags, and Tags. "
                        "These remain permanently saved until changed manually. "
                        "If you don't like AI captions, click 'Apply Default' to replace the metadata."
                    )
                    def_col1, def_col2 = st.columns(2)
                    with def_col1:
                        new_def_title = st.text_input(
                            "Generated Title (<70 chars):",
                            value=default_info.get("title", ""),
                            max_chars=70,
                            key="def_info_title_input"
                        )
                        new_def_desc = st.text_area(
                            "Description:",
                            value=default_info.get("description", ""),
                            rows=3,
                            key="def_info_desc_input"
                        )
                    with def_col2:
                        new_def_hashtags = st.text_area(
                            "Hashtags (#):",
                            value=default_info.get("hashtags", ""),
                            rows=2,
                            key="def_info_hashtags_input"
                        )
                        new_def_tags = st.text_area(
                            "Tags (No #):",
                            value=default_info.get("tags", ""),
                            rows=2,
                            key="def_info_tags_input"
                        )

                    save_def_col, apply_def_col = st.columns([1, 1])
                    with save_def_col:
                        if st.button("💾 Save Default Preferences", key="save_default_info_btn"):
                            saved_payload = {
                                "title": new_def_title,
                                "description": new_def_desc,
                                "hashtags": new_def_hashtags,
                                "tags": new_def_tags
                            }
                            save_default_info(saved_payload)
                            st.success("Default information saved to `default_information.json`! This will persist until changed manually.")
                            st.rerun()

                    with apply_def_col:
                        if st.button("⚡ Apply Default to All Current Staged Videos", key="apply_default_info_btn"):
                            updated_df = st.session_state["metadata_df"].copy()
                            updated_df["Generated Title"] = new_def_title
                            updated_df["Description"] = new_def_desc
                            updated_df["Hashtags"] = new_def_hashtags
                            updated_df["Tags"] = new_def_tags
                            st.session_state["metadata_df"] = updated_df
                            st.success("Applied default information to all staged videos!")
                            st.rerun()

                st.write("### ✏️ Editable Video Metadata Review")
                st.caption("Edit titles, descriptions, hashtags, or tags before scheduling in View 2.")

                edited_df = st.data_editor(
                    st.session_state["metadata_df"],
                    num_rows="dynamic",
                    use_container_width=True,
                    key="metadata_editor"
                )

                btn_col1, btn_col2 = st.columns([1, 1])
                with btn_col1:
                    save_clicked = st.button("💾 Save Edited Changes to staging_area", type="secondary", key="save_staging_btn")
                with btn_col2:
                    apply_all_btn = st.button("⚡ Apply Default to All Rows", key="apply_def_all_table_btn")

                if apply_all_btn:
                    cur_def = load_default_info()
                    updated_df = st.session_state["metadata_df"].copy()
                    updated_df["Generated Title"] = cur_def.get("title", "")
                    updated_df["Description"] = cur_def.get("description", "")
                    updated_df["Hashtags"] = cur_def.get("hashtags", "")
                    updated_df["Tags"] = cur_def.get("tags", "")
                    st.session_state["metadata_df"] = updated_df
                    st.toast("⚡ Applied Default Information to all video rows!", icon="📋")
                    st.rerun()

                if save_clicked:
                    updated_batch = []
                    for _, row in edited_df.iterrows():
                        raw_h = str(row.get("Hashtags", ""))
                        raw_t = str(row.get("Tags", ""))
                        h_list = [h.strip() for h in raw_h.split(",") if h.strip()]
                        t_list = [t.strip() for t in raw_t.split(",") if t.strip()]

                        updated_batch.append({
                            "filename": str(row.get("Filename", "")),
                            "title": str(row.get("Generated Title", "")),
                            "description": str(row.get("Description", STATIC_DESCRIPTION)),
                            "hashtags": h_list,
                            "tags": t_list,
                            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        })
                    save_metadata_to_staging(updated_batch)
                    st.session_state["metadata_df"] = edited_df
                    st.toast("✅ Changes saved to staging_area/metadata.json!", icon="💾")

    # ==========================================================================
    # VIEW 2: AGENT 3 (YOUTUBE UPLOADER & DYNAMIC SCHEDULER)
    # ==========================================================================
    else:
        st.title("🚀 Phase 2: YouTube Uploader & Scheduler (Agent 3)")
        st.markdown(
            "Configure dynamic publishing time slots, timezone, and batch count. "
            "Settings are automatically persisted to `schedule_config.json`."
        )

        staged_items = load_staging_metadata()

        if not staged_items:
            st.info(
                "ℹ️ No videos found in `staging_area/metadata.json`. "
                "Please go to **View 1** to upload and stage videos first."
            )
            return

        # ======================================================================
        # 1. DEDICATED SCHEDULE SETTINGS PANEL (EXPANDER)
        # ======================================================================
        with st.expander("⚙️ Schedule Settings (5 Time Slots Per Target Timezone)", expanded=True):
            st.caption(
                "Configure your 5 fixed daily schedule time slots per target timezone. "
                "Each timezone retains its own 5 custom time slots in `schedule_config.json`. "
                "Click **Save Schedule Preferences** to permanently save settings for the selected timezone."
            )

            saved_tz = schedule_cfg.get("last_selected_timezone", schedule_cfg.get("target_timezone", "America/New_York"))
            if saved_tz not in KEY_TARGET_TIMEZONES:
                saved_tz = KEY_TARGET_TIMEZONES[0]
            tz_index = KEY_TARGET_TIMEZONES.index(saved_tz)

            col_tz, col_tz_info = st.columns([2.2, 2.8])
            with col_tz:
                target_tz = st.selectbox(
                    "Target Timezone",
                    options=KEY_TARGET_TIMEZONES,
                    index=tz_index,
                    format_func=lambda tz: TIMEZONE_DISPLAY_NAMES.get(tz, tz),
                    help="Select target timezone from strictly these 5 key target timezones. Time slots are saved and loaded independently per timezone."
                )

            # Keep last_selected_timezone in sync when timezone is changed
            if target_tz != saved_tz:
                schedule_cfg["last_selected_timezone"] = target_tz
                schedule_cfg["target_timezone"] = target_tz
                save_schedule_config(schedule_cfg)

            # Load the 5 saved slots for this selected timezone
            tz_saved_slots = schedule_cfg.get("timezones", {}).get(target_tz, ["12:00", "18:00", "00:00", "06:00", "15:00"])

            st.markdown(f"##### ⏰ 5 Static Schedule Time Slots for **{TIMEZONE_DISPLAY_NAMES.get(target_tz, target_tz)}**")
            st.caption("Editing times below and clicking 'Save Schedule Preferences' saves them directly under this timezone in `schedule_config.json`.")

            col_s1, col_s2, col_s3, col_s4, col_s5 = st.columns(5)
            with col_s1:
                slot1_val = st.time_input("Slot 1", value=parse_time_str(tz_saved_slots[0]), key=f"cfg_slot_1_{target_tz}")
            with col_s2:
                slot2_val = st.time_input("Slot 2", value=parse_time_str(tz_saved_slots[1]), key=f"cfg_slot_2_{target_tz}")
            with col_s3:
                slot3_val = st.time_input("Slot 3", value=parse_time_str(tz_saved_slots[2]), key=f"cfg_slot_3_{target_tz}")
            with col_s4:
                slot4_val = st.time_input("Slot 4", value=parse_time_str(tz_saved_slots[3]), key=f"cfg_slot_4_{target_tz}")
            with col_s5:
                slot5_val = st.time_input("Slot 5", value=parse_time_str(tz_saved_slots[4]), key=f"cfg_slot_5_{target_tz}")

            save_prefs_btn = st.button("💾 Save Schedule Preferences", type="primary")
            if save_prefs_btn:
                new_slots_str = [
                    slot1_val.strftime("%H:%M"),
                    slot2_val.strftime("%H:%M"),
                    slot3_val.strftime("%H:%M"),
                    slot4_val.strftime("%H:%M"),
                    slot5_val.strftime("%H:%M")
                ]
                if "timezones" not in schedule_cfg:
                    schedule_cfg["timezones"] = {}
                schedule_cfg["timezones"][target_tz] = new_slots_str
                schedule_cfg["last_selected_timezone"] = target_tz
                schedule_cfg["target_timezone"] = target_tz
                schedule_cfg["slots"] = new_slots_str
                save_schedule_config(schedule_cfg)
                st.success(f"✅ Schedule preferences for **{TIMEZONE_DISPLAY_NAMES.get(target_tz, target_tz)}** saved to `schedule_config.json`! Settings will persist across all runs.")

        active_slots = [slot1_val, slot2_val, slot3_val, slot4_val, slot5_val]
        active_tz = target_tz

        st.write("---")

        # ======================================================================
        # 2. UPLOAD BATCH & START DATE SELECTION
        # ======================================================================
        st.write("### 📅 Video Batch & Start Date")

        col_cfg1, col_cfg2 = st.columns([1.5, 1.5], gap="medium")

        with col_cfg1:
            max_available = min(5, len(staged_items))
            default_batch = min(3, max_available)
            batch_count = st.slider(
                "Number of Videos to Upload",
                min_value=1,
                max_value=5,
                value=default_batch,
                help="Limits the upload batch to only process the selected number of videos."
            )

        with col_cfg2:
            today = date.today()
            publish_start_date = st.date_input(
                "Start Date",
                value=today,
                min_value=today,
                help="Base starting date mapped directly to Slot 1."
            )

        # YouTube Upload Criteria Guard: Auto-advance past slots toggle
        auto_advance_past = st.checkbox(
            "🛡️ Automatically advance past slots to tomorrow (Recommended for YouTube API compliance)",
            value=True,
            help="YouTube API strictly rejects videos with a publishAt time that is in the past or less than 5 minutes in the future (HTTP 400 invalidPublishAt). When enabled, any slot that has already passed today automatically rolls to tomorrow."
        )

        # ======================================================================
        # 3. VIDEO-TO-SLOT DIRECT MAPPING & PREVIEW TABLE
        # ======================================================================
        batch_to_process = staged_items[:batch_count]

        schedule_info = calculate_slot_schedule(
            start_date=publish_start_date,
            time_slots=active_slots,
            timezone_name=active_tz,
            count=len(batch_to_process),
            auto_advance_past=auto_advance_past
        )

        st.subheader(f"📋 Interactive Publishing Preview ({len(batch_to_process)} of {len(staged_items)} Videos)")
        st.caption(
            f"Strict Video-to-Slot Direct Mapping ({active_tz}): Video 1 ➔ Slot 1, Video 2 ➔ Slot 2, Video 3 ➔ Slot 3, Video 4 ➔ Slot 4, Video 5 ➔ Slot 5."
        )

        preview_cards = []
        has_invalid_youtube_slot = False
        for i, item in enumerate(batch_to_process):
            sched = schedule_info[i]
            if not sched["is_valid_youtube"]:
                has_invalid_youtube_slot = True
                yt_status = "⚠️ In Past (YouTube Rejects)"
            else:
                yt_status = f"✅ Valid Future (+{sched['minutes_from_now']}m)"

            preview_cards.append({
                "Video Slot": f"Video {i + 1} ({sched['slot_name']})",
                "Filename": item.get("filename", ""),
                "Assigned Publish Date": sched["publish_date"],
                "Local Scheduled Time": f"{sched['local_time']} ({active_tz})",
                "ISO 8601 UTC (publishAt)": sched["utc_iso"],
                "YouTube Criteria Status": yt_status,
                "Title": item.get("title", ""),
                "Hashtags": " ".join(item.get("hashtags", []))
            })

        st.dataframe(pd.DataFrame(preview_cards), use_container_width=True, hide_index=True)

        if has_invalid_youtube_slot:
            st.error(
                "⚠️ **YouTube Criteria Warning**: One or more scheduled times are in the past or within 5 minutes of current time. "
                "YouTube API will reject past publishing times with an `invalidPublishAt` error. "
                "Please enable the **'Automatically advance past slots to tomorrow'** checkbox above or choose a future Start Date."
            )

        if len(staged_items) > batch_count:
            st.info(f"ℹ️ {len(staged_items) - batch_count} additional video(s) remain staged for future batches.")

        st.write("---")

        # ======================================================================
        # 5. AUTHENTICATION & UPLOAD EXECUTION
        # ======================================================================
        col_btn, col_info = st.columns([1.2, 2])
        with col_btn:
            upload_button = st.button(
                f"🔑 Authenticate & Upload {len(batch_to_process)} Videos to YouTube",
                type="primary",
                use_container_width=True
            )

        with col_info:
            st.caption(
                "Requires `client_secrets.json` in root folder. "
                "Videos are uploaded as **Private** with respective scheduled **publishAt** timestamps."
            )

        if upload_button:
            # YouTube API Criteria Pre-flight Check: Ensure no past timestamps
            invalid_items = [s for s in schedule_info if not s["is_valid_youtube"]]
            if invalid_items:
                st.error(
                    f"❌ **Upload Blocked by YouTube API Criteria:** {len(invalid_items)} video(s) have scheduled times "
                    f"in the past or less than 5 minutes from now (e.g., `{invalid_items[0]['local_display']}` / UTC: `{invalid_items[0]['utc_iso']}`). "
                    "YouTube API strictly requires all `publishAt` timestamps to be in the future. "
                    "Please enable 'Automatically advance past slots to tomorrow' or select a future Start Date."
                )
                return

            try:
                # 1. Authenticate
                with st.spinner("Verifying YouTube OAuth 2.0 Credentials..."):
                    youtube_service = get_authenticated_youtube_service()

                st.success("✅ YouTube OAuth Authentication Successful!")
                progress_bar = st.progress(0)
                status_box = st.empty()

                uploaded_results = []

                # 2. Upload batch
                for idx, item in enumerate(batch_to_process):
                    filename = item.get("filename")
                    video_path = os.path.join(STAGING_DIR, filename)
                    sched = schedule_info[idx]

                    if not os.path.exists(video_path):
                        st.error(f"File not found in staging area: `{video_path}`")
                        continue

                    status_box.info(
                        f"Uploading [{idx + 1}/{len(batch_to_process)}] `{filename}` "
                        f"— Scheduled: {sched['local_display']}..."
                    )

                    video_id = upload_single_video_to_youtube(
                        youtube=youtube_service,
                        video_file_path=video_path,
                        title=item.get("title", filename),
                        description=item.get("description", STATIC_DESCRIPTION),
                        hashtags=item.get("hashtags", []),
                        tags=item.get("tags", []),
                        publish_at_utc_iso=sched["utc_iso"]
                    )

                    watch_url = f"https://www.youtube.com/watch?v={video_id}"
                    uploaded_results.append({
                        "filename": filename,
                        "title": item.get("title"),
                        "video_id": video_id,
                        "watch_url": watch_url,
                        "scheduled_time": sched["local_display"],
                        "utc_iso": sched["utc_iso"],
                        "uploaded_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "status": "Published (Scheduled Private)"
                    })

                    progress_bar.progress((idx + 1) / len(batch_to_process))

                # 3. Post-upload cleanup & history logging
                if uploaded_results:
                    update_history(uploaded_results)

                    # Remove uploaded videos from staging metadata
                    uploaded_filenames = {r["filename"] for r in uploaded_results}
                    remaining_staged = [it for it in staged_items if it.get("filename") not in uploaded_filenames]
                    save_metadata_to_staging(remaining_staged)

                    # Delete uploaded physical files from staging_area/
                    for res in uploaded_results:
                        p = os.path.join(STAGING_DIR, res["filename"])
                        if os.path.exists(p):
                            try:
                                os.remove(p)
                            except Exception:
                                pass

                    st.session_state["metadata_df"] = None

                    st.success(f"🎉 **Batch Upload Complete! Uploaded {len(uploaded_results)} video(s). Staging area updated.**")

                    st.write("### 🔗 Published & Scheduled Video Links:")
                    for res in uploaded_results:
                        st.markdown(
                            f"- **{res['filename']}**: [{res['title']}]({res['watch_url']}) "
                            f"— *Publishes: {res['scheduled_time']} (UTC: `{res['utc_iso']}`)*"
                        )

            except Exception as auth_err:
                st.error(
                    "🚨 **Authentication Failed or Token Expired! "
                    "Please ensure `client_secrets.json` is in your root folder and click Re-authenticate.**"
                )
                with st.expander("Detailed Error Traceback"):
                    st.exception(auth_err)


if __name__ == "__main__":
    main()
