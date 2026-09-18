import React, { useState, useRef, useEffect } from 'react';
import {
  Film,
  Upload,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Trash2,
  Save,
  Plus,
  Edit3,
  RefreshCw,
  Download,
  Play,
  FileVideo,
  X,
  Eye,
  Check,
  Calendar,
  KeyRound,
  ExternalLink,
  ShieldAlert,
  Youtube,
  Layers,
  ArrowRight,
  Sliders,
  Globe,
  Bookmark,
  RotateCcw,
  Settings2,
  FileText
} from 'lucide-react';

export interface DefaultInformation {
  title: string;
  description: string;
  hashtags: string;
  tags: string;
}

export const DEFAULT_INFO_STORAGE_KEY = "yt_default_information";
export const INITIAL_DEFAULT_INFO: DefaultInformation = {
  title: "Amazing Video Reel | Must Watch!",
  description: "Thanks for watching! Make sure to like, comment, and subscribe for daily videos.",
  hashtags: "#Shorts, #Viral, #Trending, #YouTubeShorts, #Reels",
  tags: "shorts, viral video, trending, youtube shorts, entertainment, highlights"
};

interface StagedVideoFile {
  id: string;
  name: string;
  sizeFormatted: string;
  sizeBytes: number;
  previewUrl?: string;
  fileObject?: File;
  stagedTime: string;
}

interface HistoryItem {
  filename: string;
  processed_at: string;
  status?: string;
  watch_url?: string;
  scheduled_time?: string;
  utc_iso?: string;
}

interface EditableMetadataRow {
  id: string;
  filename: string;
  title: string;
  description: string;
  hashtags: string;
  tags: string;
}

const KEY_TARGET_TIMEZONES = [
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
  "Europe/London",
  "Asia/Kolkata"
];

const TIMEZONE_DISPLAY_NAMES: Record<string, string> = {
  "America/New_York": "America/New_York (US Eastern)",
  "America/Los_Angeles": "America/Los_Angeles (US Pacific)",
  "UTC": "UTC",
  "Europe/London": "Europe/London (GMT/BST)",
  "Asia/Kolkata": "Asia/Kolkata (IST)"
};

const DEFAULT_TIMEZONE_SLOTS: Record<string, string[]> = {
  "America/New_York": ["12:00", "18:00", "00:00", "06:00", "15:00"],
  "America/Los_Angeles": ["12:00", "18:00", "00:00", "06:00", "15:00"],
  "UTC": ["12:00", "18:00", "00:00", "06:00", "15:00"],
  "Europe/London": ["12:00", "18:00", "00:00", "06:00", "15:00"],
  "Asia/Kolkata": ["12:00", "18:00", "00:00", "06:00", "15:00"]
};

interface ScheduleConfig {
  target_timezone: string;
  last_selected_timezone?: string;
  slots: string[]; // Active slots for target_timezone
  timezones: Record<string, string[]>; // Connected 5 static slots per timezone
}

const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  target_timezone: "America/New_York",
  last_selected_timezone: "America/New_York",
  slots: ["12:00", "18:00", "00:00", "06:00", "15:00"],
  timezones: { ...DEFAULT_TIMEZONE_SLOTS }
};

const initialHistory: HistoryItem[] = [
  {
    filename: "sample_drone_reel.mp4",
    processed_at: "2026-09-16 18:22:10",
    status: "Staged & AI Analyzed"
  },
  {
    filename: "tutorial_python_pipeline.mp4",
    processed_at: "2026-09-16 21:05:44",
    status: "Published (Scheduled Private)",
    watch_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    scheduled_time: "Thursday, Sep 17, 2026 at 12:00 PM (UTC)",
    utc_iso: "2026-09-17T12:00:00Z"
  }
];

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active View: 'view1' | 'view2'
  const [activeView, setActiveView] = useState<'view1' | 'view2'>('view1');

  // Staged files from PC
  const [stagedFiles, setStagedFiles] = useState<StagedVideoFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPreviewVideo, setSelectedPreviewVideo] = useState<StagedVideoFile | null>(null);

  // History Tracker
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem("yt_history_data");
    if (saved) {
      try { return JSON.parse(saved); } catch { return initialHistory; }
    }
    return initialHistory;
  });

  // Metadata Table (Agent 2 & st.data_editor)
  const [metadataRows, setMetadataRows] = useState<EditableMetadataRow[]>(() => {
    const saved = localStorage.getItem("yt_metadata_rows");
    if (saved) {
      try { return JSON.parse(saved); } catch { return []; }
    }
    return [
      {
        id: "sample-1",
        filename: "sample_drone_reel.mp4",
        title: "Spectacular 4K Drone Flight Above Mountain Peaks! 🏔️",
        description: "Thanks for watching! Subscribe for more.",
        hashtags: "#DroneFootage, #4KVideos, #CinematicLandscape, #NatureLovers, #TravelReel",
        tags: "drone video, 4k scenic, mountain landscapes, cinematic fpv, aerial videography"
      },
      {
        id: "sample-2",
        filename: "tech_guide_automation.mp4",
        title: "How to Build an Automated Video Upload Pipeline Step-by-Step 🚀",
        description: "Thanks for watching! Subscribe for more.",
        hashtags: "#YouTubeAutomation, #PythonTutorial, #Streamlit, #GeminiAI, #CodingTips",
        tags: "youtube automation, python tutorial, api integration, gemini ai, video pipeline"
      },
      {
        id: "sample-3",
        filename: "ai_multimodal_demo.mp4",
        title: "Gemini 1.5 Pro Video Understanding Test & Benchmarks 🧠",
        description: "Thanks for watching! Subscribe for more.",
        hashtags: "#GeminiAI, #ArtificialIntelligence, #MultimodalAI, #TechReview",
        tags: "gemini 1.5 pro, multimodal ai, video analysis, google deepmind, ai demo"
      }
    ];
  });

  // View 1 Processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentStepText, setCurrentStepText] = useState("");
  const [saveToast, setSaveToast] = useState(false);

  // View 2 DYNAMIC SCHEDULER CONTROLS & PERSISTENCE
  const [batchCount, setBatchCount] = useState<number>(3);
  const [publishStartDate, setPublishStartDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>(() => {
    const saved = localStorage.getItem("yt_schedule_config");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const tzMap: Record<string, string[]> = {
          ...DEFAULT_TIMEZONE_SLOTS,
          ...(parsed.timezones || {})
        };
        // Ensure each timezone has 5 valid slots
        KEY_TARGET_TIMEZONES.forEach(tz => {
          if (!tzMap[tz] || !Array.isArray(tzMap[tz]) || tzMap[tz].length < 5) {
            tzMap[tz] = [...DEFAULT_TIMEZONE_SLOTS[tz]];
          }
        });
        const activeTz = parsed.last_selected_timezone || parsed.target_timezone || "America/New_York";
        const validTz = KEY_TARGET_TIMEZONES.includes(activeTz) ? activeTz : "America/New_York";
        return {
          target_timezone: validTz,
          last_selected_timezone: validTz,
          timezones: tzMap,
          slots: [...tzMap[validTz]]
        };
      } catch (e) {
        console.error("Failed to parse yt_schedule_config:", e);
      }
    }
    return DEFAULT_SCHEDULE_CONFIG;
  });

  // View 2 YouTube Upload state
  const [isUploadingYouTube, setIsUploadingYouTube] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStepText, setUploadStepText] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [hasClientSecrets, setHasClientSecrets] = useState<boolean>(true);
  const [uploadSuccessBatch, setUploadSuccessBatch] = useState<Array<{
    filename: string;
    title: string;
    watch_url: string;
    scheduled_time: string;
    utc_iso: string;
  }> | null>(null);

  // Persist history
  useEffect(() => {
    localStorage.setItem("yt_history_data", JSON.stringify(history));
  }, [history]);

  // Persist metadata
  useEffect(() => {
    localStorage.setItem("yt_metadata_rows", JSON.stringify(metadataRows));
  }, [metadataRows]);

  // Persist schedule_config
  useEffect(() => {
    localStorage.setItem("yt_schedule_config", JSON.stringify(scheduleConfig));
  }, [scheduleConfig]);

  // Default Information (defaultinformation) State & Persistence
  const [defaultInfo, setDefaultInfo] = useState<DefaultInformation>(() => {
    const saved = localStorage.getItem(DEFAULT_INFO_STORAGE_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return INITIAL_DEFAULT_INFO;
  });
  const [defaultInfoDraft, setDefaultInfoDraft] = useState<DefaultInformation>(defaultInfo);
  const [isDefaultInfoOpen, setIsDefaultInfoOpen] = useState(false);
  const [defaultInfoSavedToast, setDefaultInfoSavedToast] = useState(false);
  const [defaultAppliedToast, setDefaultAppliedToast] = useState<string | null>(null);

  // Persist default_information
  useEffect(() => {
    localStorage.setItem(DEFAULT_INFO_STORAGE_KEY, JSON.stringify(defaultInfo));
  }, [defaultInfo]);

  const handleSaveDefaultInfo = () => {
    setDefaultInfo({ ...defaultInfoDraft });
    localStorage.setItem(DEFAULT_INFO_STORAGE_KEY, JSON.stringify(defaultInfoDraft));
    setDefaultInfoSavedToast(true);
    setTimeout(() => setDefaultInfoSavedToast(false), 3000);
  };

  const handleResetDefaultInfoDraft = () => {
    setDefaultInfoDraft({ ...INITIAL_DEFAULT_INFO });
  };

  const handleApplyDefaultToAll = () => {
    if (metadataRows.length === 0) return;
    setMetadataRows(prev =>
      prev.map(row => ({
        ...row,
        title: defaultInfo.title,
        description: defaultInfo.description,
        hashtags: defaultInfo.hashtags,
        tags: defaultInfo.tags
      }))
    );
    setDefaultAppliedToast(`Applied default information to all ${metadataRows.length} video(s)!`);
    setTimeout(() => setDefaultAppliedToast(null), 3500);
  };

  const handleApplyDefaultToRow = (rowId: string) => {
    setMetadataRows(prev =>
      prev.map(row => {
        if (row.id === rowId) {
          return {
            ...row,
            title: defaultInfo.title,
            description: defaultInfo.description,
            hashtags: defaultInfo.hashtags,
            tags: defaultInfo.tags
          };
        }
        return row;
      })
    );
    setDefaultAppliedToast("Applied default information to selected video.");
    setTimeout(() => setDefaultAppliedToast(null), 3000);
  };

  // Time slot change handler for the active timezone
  const handleSlotChange = (index: number, newTime: string) => {
    setScheduleConfig(prev => {
      const updatedSlots = [...prev.slots];
      updatedSlots[index] = newTime;
      const updatedTimezones = {
        ...prev.timezones,
        [prev.target_timezone]: updatedSlots
      };
      return {
        ...prev,
        slots: updatedSlots,
        timezones: updatedTimezones
      };
    });
  };

  // Connected Target Timezone change handler:
  // When switching to any timezone, immediately load the past saved 5 static schedule time slots!
  const handleTimezoneChange = (newTz: string) => {
    setScheduleConfig(prev => {
      // Look up past saved preference for this specific timezone!
      const tzSlots = prev.timezones[newTz] && prev.timezones[newTz].length >= 5
        ? [...prev.timezones[newTz]]
        : [...(DEFAULT_TIMEZONE_SLOTS[newTz] || ["12:00", "18:00", "00:00", "06:00", "15:00"])];

      const updated: ScheduleConfig = {
        ...prev,
        target_timezone: newTz,
        last_selected_timezone: newTz,
        slots: tzSlots
      };
      localStorage.setItem("yt_schedule_config", JSON.stringify(updated));
      return updated;
    });
  };

  // Explicit Save Schedule Preferences:
  // Commits the 5 slots permanently to this specific timezone
  const handleSaveSchedulePreferences = () => {
    setScheduleConfig(prev => {
      const updatedSlots = [...prev.slots];
      const updatedTimezones = {
        ...prev.timezones,
        [prev.target_timezone]: updatedSlots
      };
      const updated: ScheduleConfig = {
        ...prev,
        slots: updatedSlots,
        timezones: updatedTimezones,
        last_selected_timezone: prev.target_timezone
      };
      localStorage.setItem("yt_schedule_config", JSON.stringify(updated));
      return updated;
    });
    setScheduleSavedToast(true);
    setTimeout(() => setScheduleSavedToast(false), 4000);
  };

  // Reset slots for the active timezone to defaults
  const handleResetCurrentTimezoneSlots = () => {
    setScheduleConfig(prev => {
      const defaultSlots = [...(DEFAULT_TIMEZONE_SLOTS[prev.target_timezone] || ["12:00", "18:00", "00:00", "06:00", "15:00"])];
      const updatedTimezones = {
        ...prev.timezones,
        [prev.target_timezone]: defaultSlots
      };
      return {
        ...prev,
        slots: defaultSlots,
        timezones: updatedTimezones
      };
    });
  };

  const [scheduleSavedToast, setScheduleSavedToast] = useState(false);

  // Remove single history item
  const handleRemoveHistoryItem = (index: number) => {
    setHistory(prev => prev.filter((_, idx) => idx !== index));
  };

  // Clear all history
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const handleClearAllHistory = () => {
    setHistory([]);
    setShowClearConfirm(false);
  };

  // Strict Video-to-Slot Direct Mapping:
  // Video 1 -> Selected Start Date + Saved Slot 1 Time
  // Video 2 -> Selected Start Date + Saved Slot 2 Time
  // Video 3 -> Selected Start Date + Saved Slot 3 Time
  // Video 4 -> Selected Start Date + Saved Slot 4 Time
  // Video 5 -> Selected Start Date + Saved Slot 5 Time
  const calculateDynamicSlots = (count: number) => {
    const results = [];
    const baseDate = new Date(publishStartDate + "T00:00:00");

    for (let i = 0; i < count; i++) {
      const slotIndex = i % scheduleConfig.slots.length;
      const dayOffset = Math.floor(i / scheduleConfig.slots.length);
      const slotTimeStr = scheduleConfig.slots[slotIndex] || "12:00";
      const [hours, minutes] = slotTimeStr.split(":").map(Number);

      const scheduledDate = new Date(baseDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      scheduledDate.setHours(hours, minutes, 0, 0);

      const publishDateStr = scheduledDate.toISOString().split('T')[0];
      const timeFormatted = scheduledDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const localDisplay = `${scheduledDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })} at ${timeFormatted} (${scheduleConfig.target_timezone})`;

      // Standard ISO 8601 UTC format: YYYY-MM-DDTHH:MM:SSZ
      const utcIso = scheduledDate.toISOString().replace(/\.\d{3}Z$/, "Z");

      results.push({
        slotNumber: i + 1,
        slotName: `Slot ${slotIndex + 1}`,
        publishDate: publishDateStr,
        localTime: `${timeFormatted} (${scheduleConfig.target_timezone})`,
        localDisplay,
        utcIso,
        dateObj: scheduledDate
      });
    }

    return results;
  };

  // File Handling
  const handleFiles = (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(f =>
      f.name.toLowerCase().endsWith('.mp4') || f.type.includes('mp4') || f.type.includes('video')
    );

    if (validFiles.length === 0) {
      alert("Please select MP4 video files (.mp4)");
      return;
    }

    const newStaged: StagedVideoFile[] = validFiles.map((file, idx) => {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const url = URL.createObjectURL(file);
      return {
        id: `${Date.now()}-${idx}-${file.name}`,
        name: file.name,
        sizeFormatted: `${sizeMB} MB`,
        sizeBytes: file.size,
        previewUrl: url,
        fileObject: file,
        stagedTime: new Date().toLocaleTimeString()
      };
    });

    setStagedFiles(prev => [...prev, ...newStaged]);
    if (!selectedPreviewVideo && newStaged.length > 0) {
      setSelectedPreviewVideo(newStaged[0]);
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeStagedFile = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setStagedFiles(prev => {
      const filtered = prev.filter(f => f.id !== id);
      if (selectedPreviewVideo?.id === id) {
        setSelectedPreviewVideo(filtered[0] || null);
      }
      return filtered;
    });
  };

  // Run Agent 1 & Agent 2
  const handleProcessBatch = () => {
    if (stagedFiles.length === 0) return;

    setIsProcessing(true);
    setProgressPercent(10);
    setCurrentStepText("Agent 1: Staging files into staging_area/ and updating history.json...");

    setTimeout(() => {
      setProgressPercent(35);
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

      const newHistoryEntries: HistoryItem[] = stagedFiles.map(f => ({
        filename: f.name,
        processed_at: nowStr,
        status: "Staged & AI Analyzed"
      }));
      setHistory(prev => [...newHistoryEntries, ...prev]);

      setCurrentStepText("Agent 2: Multimodal Gemini 1.5 Pro visual frame analysis...");

      setTimeout(() => {
        setProgressPercent(70);
        setCurrentStepText("Agent 2: Generating Titles (<70 chars), Trending #Hashtags, and Tags...");

        setTimeout(() => {
          setProgressPercent(100);
          setCurrentStepText("Agent 2: Metadata complete & saved into staging_area/metadata.json!");

          const generatedEntries: EditableMetadataRow[] = stagedFiles.map((f, index) => {
            const cleanName = f.name
              .replace(/\.[^/.]+$/, "")
              .replace(/[_-]/g, " ")
              .replace(/\b\w/g, l => l.toUpperCase());

            return {
              id: `meta-${Date.now()}-${index}`,
              filename: f.name,
              title: `${cleanName} — Full Breakdown & Guide! 🔥`,
              description: "Thanks for watching! Subscribe for more.",
              hashtags: "#YouTubeAutomation, #TechTutorial, #TrendingNow, #GeminiAI, #ContentCreator",
              tags: "youtube automation, content creation, tutorial guide, tech workflow, creator tools"
            };
          });

          setMetadataRows(prev => [...generatedEntries, ...prev]);
          setIsProcessing(false);
        }, 700);
      }, 800);
    }, 800);
  };

  // Table cell editing
  const handleCellChange = (id: string, field: keyof EditableMetadataRow, value: string) => {
    setMetadataRows(prev =>
      prev.map(row => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleAddNewRow = () => {
    const newId = `custom-${Date.now()}`;
    const newRow: EditableMetadataRow = {
      id: newId,
      filename: `video_batch_${metadataRows.length + 1}.mp4`,
      title: "Enter Catchy Video Title Here",
      description: "Thanks for watching! Subscribe for more.",
      hashtags: "#YouTube, #Automation, #Tutorial, #Tech, #Creator",
      tags: "youtube tips, automation, video tutorial, workflow"
    };
    setMetadataRows(prev => [newRow, ...prev]);
  };

  const handleDeleteRow = (id: string) => {
    setMetadataRows(prev => prev.filter(r => r.id !== id));
  };

  const handleSaveMetadataJson = () => {
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  const handleDownloadJson = () => {
    const formattedData = metadataRows.map(row => ({
      filename: row.filename,
      title: row.title,
      description: row.description,
      hashtags: row.hashtags.split(",").map(h => h.trim()).filter(Boolean),
      tags: row.tags.split(",").map(t => t.trim()).filter(Boolean),
      saved_at: new Date().toISOString()
    }));

    const blob = new Blob([JSON.stringify(formattedData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "metadata.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // AGENT 3: Authenticate & Upload
  const handleAuthenticateAndUpload = () => {
    setAuthError(null);
    setUploadSuccessBatch(null);

    if (!hasClientSecrets) {
      setAuthError(
        "Authentication Failed or Token Expired! Please ensure client_secrets.json is in your root folder and click Re-authenticate."
      );
      return;
    }

    if (metadataRows.length === 0) {
      alert("No staged metadata found! Please stage videos in View 1 first.");
      return;
    }

    const activeBatch = metadataRows.slice(0, batchCount);
    const scheduleData = calculateDynamicSlots(activeBatch.length);

    setIsUploadingYouTube(true);
    setUploadProgress(15);
    setUploadStepText("Verifying OAuth 2.0 credentials and token.json...");

    setTimeout(() => {
      setUploadProgress(40);
      setUploadStepText("Connecting to YouTube Data API v3 (videos.insert)...");

      setTimeout(() => {
        setUploadProgress(75);
        setUploadStepText(`Uploading batch [1/${activeBatch.length}]: ${activeBatch[0].filename} (Private with publishAt)...`);

        setTimeout(() => {
          setUploadProgress(100);
          setUploadStepText("Upload batch complete! Syncing history.json and updating staging area...");

          const mockIds = ["7lCDEGXw530", "dQw4w9WgXcQ", "3JZ_D3ELwOQ", "kXYiU_JCYtU", "ZXsQAXx_ao0"];
          const uploadedItems = activeBatch.map((item, idx) => ({
            filename: item.filename,
            title: item.title,
            watch_url: `https://www.youtube.com/watch?v=${mockIds[idx % mockIds.length]}`,
            scheduled_time: scheduleData[idx].localDisplay,
            utc_iso: scheduleData[idx].utcIso
          }));

          // Append to history
          const newHistoryEntries: HistoryItem[] = uploadedItems.map(up => ({
            filename: up.filename,
            processed_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
            status: "Published (Scheduled Private)",
            watch_url: up.watch_url,
            scheduled_time: up.scheduled_time,
            utc_iso: up.utc_iso
          }));
          setHistory(prev => [...newHistoryEntries, ...prev]);

          // Remove uploaded from staging
          setMetadataRows(prev => prev.slice(batchCount));
          setStagedFiles([]);
          setSelectedPreviewVideo(null);

          setUploadSuccessBatch(uploadedItems);
          setIsUploadingYouTube(false);
        }, 800);
      }, 800);
    }, 800);
  };

  // Calculate current active schedule preview
  const currentBatchToProcess = metadataRows.slice(0, batchCount);
  const calculatedScheduleInfo = calculateDynamicSlots(currentBatchToProcess.length);

  return (
    <div id="app-root" className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Hidden Native File Input */}
      <input
        type="file"
        ref={fileInputRef}
        id="pc-video-file-input"
        accept="video/mp4,video/*,.mp4"
        multiple
        onChange={onFileInputChange}
        className="hidden"
        tabIndex={-1}
      />

      {/* Main Top Header & Navigation Bar */}
      <header id="main-header" className="border-b border-slate-200 bg-white px-6 py-3.5 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 text-red-600 rounded-lg border border-red-200">
              <Film className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">YouTube Upload Automation</h1>
                <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded-full border border-red-200">
                  Streamlit Multi-Page
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Agent 1 (Staging) • Agent 2 (Gemini Metadata) • Agent 3 (Dynamic Scheduler & Uploader)
              </p>
            </div>
          </div>

          {/* TOP TAB NAVIGATION */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              id="nav-view-1-btn"
              onClick={() => setActiveView('view1')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeView === 'view1'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-red-500" />
              <span>View 1: Staging & AI Metadata</span>
            </button>

            <button
              id="nav-view-2-btn"
              onClick={() => setActiveView('view2')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeView === 'view2'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Youtube className="w-3.5 h-3.5" />
              <span>View 2: YouTube Uploader & Scheduler</span>
              {metadataRows.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeView === 'view2' ? 'bg-red-800 text-white' : 'bg-red-100 text-red-700'
                }`}>
                  {metadataRows.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">

        {/* ========================================================================= */}
        {/* VIEW 1: AGENT 1 & AGENT 2 (STAGING & AI METADATA GENERATOR)                */}
        {/* ========================================================================= */}
        {activeView === 'view1' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* LEFT COLUMN: History Tracker */}
            <div id="col1-history" className="lg:col-span-4 space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <h3 className="font-semibold text-slate-800 text-sm">📜 History Tracker</h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {history.length > 0 && (
                      <button
                        onClick={() => setShowClearConfirm(!showClearConfirm)}
                        className="text-[11px] text-red-600 hover:text-red-800 font-medium px-2 py-0.5 rounded hover:bg-red-50 border border-transparent hover:border-red-200 transition flex items-center gap-1"
                        title="Remove all history records"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Clear All</span>
                      </button>
                    )}
                    <span className="text-[11px] bg-slate-100 text-slate-600 font-mono px-2 py-0.5 rounded border border-slate-200">
                      history.json
                    </span>
                  </div>
                </div>

                {/* Inline Confirmation for Clear All History */}
                {showClearConfirm && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs space-y-2 mb-3">
                    <p className="font-semibold text-red-900">
                      ⚠️ Are you sure you want to remove all {history.length} history records?
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleClearAllHistory}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded text-[11px] transition shadow-xs"
                      >
                        Yes, Remove All
                      </button>
                      <button
                        onClick={() => setShowClearConfirm(false)}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 font-medium rounded text-[11px] border border-slate-200 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-xs text-slate-500 mb-3">
                  Previously processed & scheduled files (click trash icon to remove individual item):
                </p>

                {history.length === 0 ? (
                  <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-slate-400 text-xs">
                    <AlertCircle className="w-6 h-6 mx-auto text-slate-400 mb-2" />
                    No processing history found.<br />Files processed will appear here.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 bg-slate-50/70 rounded-lg border border-slate-200 max-h-[380px] overflow-y-auto">
                    {history.map((item, idx) => (
                      <div key={idx} className="p-3 hover:bg-slate-100/60 transition-colors group">
                        <div className="flex items-center justify-between gap-1 text-xs font-mono font-semibold text-slate-800">
                          <span className="truncate flex items-center gap-1.5">
                            <Film className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            {item.filename}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.watch_url && (
                              <a
                                href={item.watch_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-red-600 hover:text-red-700 text-[11px] flex items-center gap-0.5 font-bold"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Watch</span>
                              </a>
                            )}
                            <button
                              onClick={() => handleRemoveHistoryItem(idx)}
                              title="Remove this item from history"
                              className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                          <span className="truncate">{item.status || "Processed"}</span>
                          <span className="font-mono text-slate-600 shrink-0">{item.processed_at.substring(0, 16)}</span>
                        </div>
                        {item.scheduled_time && (
                          <div className="text-[10px] text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded mt-1 font-mono">
                            🗓️ {item.scheduled_time}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
                  <span className="text-slate-500">Total Historical Records:</span>
                  <div className="flex items-center gap-2">
                    {history.length > 0 && (
                      <button
                        onClick={() => setShowClearConfirm(true)}
                        className="text-[11px] text-slate-400 hover:text-red-600 underline"
                      >
                        Remove all
                      </button>
                    )}
                    <span className="font-bold text-slate-800 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {history.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* View 2 quick transition banner */}
              {metadataRows.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs space-y-2">
                  <div className="font-semibold text-red-900 flex items-center justify-between">
                    <span>Ready for YouTube Upload?</span>
                    <span className="bg-red-200 text-red-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                      {metadataRows.length} staged
                    </span>
                  </div>
                  <p className="text-red-700">
                    Switch to View 2 to configure publishing slots and run the YouTube Uploader.
                  </p>
                  <button
                    onClick={() => setActiveView('view2')}
                    className="w-full mt-2 py-2 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 transition shadow-xs"
                  >
                    <span>Go to YouTube Uploader & Scheduler</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: Video Upload & Metadata Review */}
            <div id="col2-dashboard" className="lg:col-span-8 space-y-6">

              {/* Video Upload Box */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Upload className="w-5 h-5 text-red-500" />
                    <h3 className="font-semibold text-slate-900 text-base">📤 Video Upload & Batch Staging</h3>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-mono">
                    Agent 1 & Agent 2
                  </span>
                </div>

                {/* NATIVE PC FILE UPLOADER & DRAG/DROP ZONE */}
                <div
                  id="pc-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleFiles(e.dataTransfer.files);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer select-none ${
                    isDragging
                      ? 'border-red-500 bg-red-50/60 scale-[1.01]'
                      : 'border-slate-300 hover:border-red-400 bg-slate-50/70 hover:bg-slate-50'
                  }`}
                >
                  <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-red-200 shadow-2xs">
                    <Upload className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Drag and drop MP4 video files here, or click to browse
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Accepts multiple .mp4 files • Copies directly into <code>staging_area/</code>
                  </p>

                  <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-xs transition">
                    <FileVideo className="w-4 h-4" />
                    <span>Click to Browse PC Files</span>
                  </div>
                </div>

                {/* STAGED FILES PREVIEW */}
                {stagedFiles.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Staged for Processing ({stagedFiles.length} video{stagedFiles.length > 1 ? 's' : ''}):
                      </span>
                      <button
                        onClick={() => setStagedFiles([])}
                        className="text-slate-400 hover:text-red-600 text-[11px] underline"
                      >
                        Clear all
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {stagedFiles.map((file) => (
                        <div
                          key={file.id}
                          onClick={() => setSelectedPreviewVideo(file)}
                          className={`border rounded-lg p-3 flex items-center justify-between text-xs cursor-pointer transition ${
                            selectedPreviewVideo?.id === file.id
                              ? 'bg-red-50/50 border-red-300 ring-1 ring-red-400'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate pr-2">
                            <div className="p-1.5 bg-red-100 text-red-600 rounded">
                              <Film className="w-4 h-4 shrink-0" />
                            </div>
                            <div className="truncate">
                              <div className="font-semibold text-slate-900 truncate font-mono">{file.name}</div>
                              <div className="text-[11px] text-slate-500">{file.sizeFormatted} • Staged at {file.stagedTime}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedPreviewVideo(file); }}
                              title="Preview video"
                              className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => removeStagedFile(file.id, e)}
                              title="Remove file"
                              className="p-1 text-slate-400 hover:text-red-600 rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Inline Video Player Preview */}
                    {selectedPreviewVideo && selectedPreviewVideo.previewUrl && (
                      <div className="bg-slate-900 text-white rounded-xl p-4 space-y-2 border border-slate-800">
                        <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800">
                          <span className="font-mono text-slate-300 flex items-center gap-2">
                            <Eye className="w-4 h-4 text-red-400" />
                            Playing Preview: <strong className="text-white">{selectedPreviewVideo.name}</strong>
                          </span>
                          <span className="text-[11px] text-slate-400">{selectedPreviewVideo.sizeFormatted}</span>
                        </div>
                        <video
                          src={selectedPreviewVideo.previewUrl}
                          controls
                          className="w-full max-h-56 rounded-lg bg-black mx-auto"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* PROCESS BUTTON */}
                <div>
                  <button
                    id="process-generate-btn"
                    onClick={handleProcessBatch}
                    disabled={isProcessing || stagedFiles.length === 0}
                    className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-xs ${
                      isProcessing
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : stagedFiles.length === 0
                        ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                        : 'bg-red-600 hover:bg-red-700 text-white hover:shadow-md active:scale-[0.99]'
                    }`}
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Processing Visual Pipeline with Gemini...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-200" />
                        <span>🚀 Process & Generate Metadata</span>
                      </>
                    )}
                  </button>
                </div>

                {/* PROGRESS BAR */}
                {isProcessing && (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-700 font-medium flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-500" />
                        {currentStepText}
                      </span>
                      <span className="font-mono font-bold text-red-600">{progressPercent}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-red-600 h-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* DEFAULT INFORMATION (defaultinformation) CONFIGURATION PANEL */}
              <div id="default-information-panel" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-teal-50 text-teal-700 rounded-lg border border-teal-200/80">
                      <Bookmark className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-sm">Default Information</h3>
                        <span className="text-[10px] font-mono bg-teal-50 text-teal-700 px-2 py-0.5 rounded border border-teal-200 font-semibold">
                          defaultinformation
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Pre-set fixed Title, Description, Hashtags, and Tags. Saved permanently until changed manually. If you dislike AI generated captions, apply this default template.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsDefaultInfoOpen(!isDefaultInfoOpen)}
                      className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition flex items-center gap-1.5 border border-slate-200"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                      <span>{isDefaultInfoOpen ? "Hide Settings" : "Configure Defaults"}</span>
                    </button>

                    <button
                      onClick={handleApplyDefaultToAll}
                      disabled={metadataRows.length === 0}
                      title="Apply default information to all videos in the table"
                      className="px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold rounded-lg transition flex items-center gap-1.5 shadow-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Apply Default to All</span>
                    </button>
                  </div>
                </div>

                {/* Notification toast if default info was saved */}
                {defaultInfoSavedToast && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Default Information Saved!</strong> This template will remain permanently saved in your configuration until you change it manually.
                    </span>
                  </div>
                )}

                {/* Active Template Summary (visible when collapsed) */}
                {!isDefaultInfoOpen && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Generated Title (&lt;70 chars)</span>
                      <div className="font-semibold text-slate-800 line-clamp-1">{defaultInfo.title || "—"}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Description</span>
                      <div className="text-slate-600 line-clamp-1">{defaultInfo.description || "—"}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Hashtags (#)</span>
                      <div className="text-teal-700 font-mono text-[11px] line-clamp-1">{defaultInfo.hashtags || "—"}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Tags (No #)</span>
                      <div className="text-slate-700 line-clamp-1">{defaultInfo.tags || "—"}</div>
                    </div>
                  </div>
                )}

                {/* Detailed Configuration Inputs (when opened) */}
                {isDefaultInfoOpen && (
                  <div className="space-y-4 pt-1 animate-in fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* 1. Generated Title */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-teal-600" />
                            <span>Generated Title (&lt;70 chars)</span>
                          </label>
                          <span className={`text-[11px] font-mono ${defaultInfoDraft.title.length > 70 ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                            {defaultInfoDraft.title.length}/70
                          </span>
                        </div>
                        <input
                          type="text"
                          maxLength={80}
                          value={defaultInfoDraft.title}
                          onChange={e => setDefaultInfoDraft(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="e.g. Amazing Video Highlights | Must Watch!"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 outline-hidden focus:border-teal-500"
                        />
                        {defaultInfoDraft.title.length > 70 && (
                          <p className="text-[10px] text-red-600">YouTube titles are recommended to stay under 70 characters.</p>
                        )}
                      </div>

                      {/* 2. Description */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Description
                        </label>
                        <textarea
                          rows={2}
                          value={defaultInfoDraft.description}
                          onChange={e => setDefaultInfoDraft(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Fixed description text, links, channel info..."
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 outline-hidden focus:border-teal-500 resize-none"
                        />
                      </div>

                      {/* 3. Hashtags (#) */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Hashtags (#)
                        </label>
                        <textarea
                          rows={2}
                          value={defaultInfoDraft.hashtags}
                          onChange={e => setDefaultInfoDraft(prev => ({ ...prev, hashtags: e.target.value }))}
                          placeholder="e.g. #Shorts, #Viral, #Trending, #YouTubeShorts, #Reels"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-teal-700 font-mono outline-hidden focus:border-teal-500 resize-none"
                        />
                      </div>

                      {/* 4. Tags (No #) */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Tags (No #)
                        </label>
                        <textarea
                          rows={2}
                          value={defaultInfoDraft.tags}
                          onChange={e => setDefaultInfoDraft(prev => ({ ...prev, tags: e.target.value }))}
                          placeholder="e.g. shorts, viral video, trending, youtube shorts, entertainment"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 outline-hidden focus:border-teal-500 resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSaveDefaultInfo}
                          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 shadow-xs"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Default Preferences</span>
                        </button>

                        <button
                          onClick={handleResetDefaultInfoDraft}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs"
                        >
                          Reset Draft
                        </button>
                      </div>

                      <button
                        onClick={handleApplyDefaultToAll}
                        disabled={metadataRows.length === 0}
                        className="px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 font-semibold rounded-lg text-xs flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Apply This Default to All Videos in Table</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* EDITABLE RESULTS TABLE */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Edit3 className="w-5 h-5 text-red-500" />
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm">✏️ Editable Video Metadata Review</h3>
                      <p className="text-[11px] text-slate-500">
                        Generated based on video visuals: Title (&lt;70 chars), Hashtags, and Tags.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleApplyDefaultToAll}
                      disabled={metadataRows.length === 0}
                      title="Replace metadata with saved Default Information"
                      className="px-2.5 py-1.5 text-xs bg-teal-50 hover:bg-teal-100 text-teal-700 font-medium rounded-lg transition flex items-center gap-1 border border-teal-200"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Apply Default</span>
                    </button>

                    <button
                      onClick={handleAddNewRow}
                      className="px-2.5 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition flex items-center gap-1 border border-slate-200"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Row</span>
                    </button>

                    <button
                      onClick={handleSaveMetadataJson}
                      className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition flex items-center gap-1.5 shadow-xs"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save to staging_area</span>
                    </button>

                    <button
                      onClick={handleDownloadJson}
                      title="Download metadata.json"
                      className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {defaultAppliedToast && (
                  <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs flex items-center gap-2 animate-in fade-in duration-200">
                    <Check className="w-4 h-4 text-teal-600" />
                    <span>{defaultAppliedToast}</span>
                  </div>
                )}

                {saveToast && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2 animate-in fade-in duration-200">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Metadata saved into <code>staging_area/metadata.json</code> successfully!</span>
                  </div>
                )}

                {/* TABLE CONTAINER */}
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-3 border-r border-slate-200 w-44">Filename</th>
                        <th className="p-3 border-r border-slate-200 w-60">Generated Title (&lt;70 chars)</th>
                        <th className="p-3 border-r border-slate-200 w-48">Description</th>
                        <th className="p-3 border-r border-slate-200 w-52">Hashtags (#)</th>
                        <th className="p-3 border-r border-slate-200 w-52">Tags (No #)</th>
                        <th className="p-3 w-10 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {metadataRows.map(row => (
                        <tr key={row.id} className="hover:bg-red-50/20 transition-colors">
                          <td className="p-2 border-r border-slate-200 align-top">
                            <input
                              type="text"
                              value={row.filename}
                              onChange={e => handleCellChange(row.id, 'filename', e.target.value)}
                              className="w-full bg-transparent hover:bg-white focus:bg-white px-2 py-1 rounded border border-transparent focus:border-red-400 font-mono text-xs text-slate-900 outline-hidden"
                            />
                          </td>
                          <td className="p-2 border-r border-slate-200 align-top">
                            <textarea
                              value={row.title}
                              onChange={e => handleCellChange(row.id, 'title', e.target.value)}
                              rows={2}
                              className="w-full bg-transparent hover:bg-white focus:bg-white px-2 py-1 rounded border border-transparent focus:border-red-400 text-xs font-semibold text-slate-900 outline-hidden resize-none"
                            />
                          </td>
                          <td className="p-2 border-r border-slate-200 align-top">
                            <textarea
                              value={row.description}
                              onChange={e => handleCellChange(row.id, 'description', e.target.value)}
                              rows={2}
                              className="w-full bg-transparent hover:bg-white focus:bg-white px-2 py-1 rounded border border-transparent focus:border-red-400 text-xs text-slate-600 outline-hidden resize-none"
                            />
                          </td>
                          <td className="p-2 border-r border-slate-200 align-top">
                            <textarea
                              value={row.hashtags}
                              onChange={e => handleCellChange(row.id, 'hashtags', e.target.value)}
                              rows={2}
                              className="w-full bg-transparent hover:bg-white focus:bg-white px-2 py-1 rounded border border-transparent focus:border-red-400 text-xs text-teal-700 font-mono outline-hidden resize-none"
                            />
                          </td>
                          <td className="p-2 border-r border-slate-200 align-top">
                            <textarea
                              value={row.tags}
                              onChange={e => handleCellChange(row.id, 'tags', e.target.value)}
                              rows={2}
                              className="w-full bg-transparent hover:bg-white focus:bg-white px-2 py-1 rounded border border-transparent focus:border-red-400 text-xs text-slate-700 outline-hidden resize-none"
                            />
                          </td>
                          <td className="p-2 text-center align-top">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleApplyDefaultToRow(row.id)}
                                title="Apply Default Information to this video"
                                className="p-1 text-teal-700 hover:text-teal-900 hover:bg-teal-50 rounded transition"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteRow(row.id)}
                                title="Delete this row"
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{metadataRows.length} video item(s) in staging area</span>
                  <button
                    onClick={() => setActiveView('view2')}
                    className="text-red-600 hover:text-red-700 font-semibold flex items-center gap-1"
                  >
                    <span>Proceed to YouTube Uploader (Agent 3)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: AGENT 3 (YOUTUBE UPLOADER & DYNAMIC SCHEDULER)                    */}
        {/* ========================================================================= */}
        {activeView === 'view2' && (
          <div className="space-y-6">

            {/* View 2 Header */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-red-50 text-red-600 rounded-lg border border-red-200">
                    <Youtube className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Agent 3: YouTube Uploader & Dynamic Scheduler</h2>
                    <p className="text-xs text-slate-500">
                      Configure persistent time slots, target timezone, and batch size • Uploads as Private with publishAt
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-mono bg-slate-100 px-2.5 py-1 rounded border border-slate-200 text-slate-600">
                  config: schedule_config.json
                </span>
              </div>
            </div>

            {/* Error Popup Banner if client_secrets is missing or auth fails */}
            {authError && (
              <div
                id="auth-error-banner"
                className="p-4 bg-red-50 border-2 border-red-500 text-red-900 rounded-xl flex items-start gap-3 shadow-xs animate-in fade-in"
              >
                <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-red-800">Authentication Alert</h4>
                  <p className="text-xs text-red-700 font-medium">{authError}</p>
                  <div className="pt-2 flex items-center gap-3">
                    <button
                      onClick={() => { setHasClientSecrets(true); setAuthError(null); }}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold shadow-2xs"
                    >
                      Retry With client_secrets.json
                    </button>
                    <button
                      onClick={() => setAuthError(null)}
                      className="text-xs text-red-600 hover:text-red-800 underline"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Post-Upload Success Notification & Watch URLs */}
            {uploadSuccessBatch && (
              <div className="p-5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 space-y-3 shadow-xs animate-in fade-in">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Batch Upload Complete! Staging area cleared.</span>
                </div>

                <p className="text-xs text-emerald-700">
                  The uploaded videos have been scheduled on YouTube and archived in <code>history.json</code>:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  {uploadSuccessBatch.map((item, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-lg border border-emerald-200 text-xs space-y-1.5">
                      <div className="font-mono text-slate-800 font-bold truncate">{item.filename}</div>
                      <div className="text-slate-600 text-[11px] line-clamp-1">{item.title}</div>
                      <div className="text-teal-700 text-[10px] font-mono bg-teal-50 border border-teal-100 p-1 rounded">
                        🗓️ {item.scheduled_time}
                      </div>
                      <div className="text-slate-400 text-[9px] font-mono">
                        UTC: {item.utc_iso}
                      </div>
                      <a
                        href={item.watch_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-bold text-xs pt-1"
                      >
                        <Youtube className="w-3.5 h-3.5" />
                        <span>Watch on YouTube</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))}
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setActiveView('view1')}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold"
                  >
                    Upload More in View 1
                  </button>
                </div>
              </div>
            )}

            {/* 1. DEDICATED SCHEDULE SETTINGS PANEL */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-red-500" />
                  <h3 className="font-semibold text-slate-900 text-sm">
                    ⚙️ Schedule Settings (Persistent Time Slots & Timezone)
                  </h3>
                </div>
                <span className="text-xs font-mono bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded border border-slate-200">
                  schedule_config.json
                </span>
              </div>

              {scheduleSavedToast && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Saved!</strong> Preferences for <strong>{TIMEZONE_DISPLAY_NAMES[scheduleConfig.target_timezone] || scheduleConfig.target_timezone}</strong> saved to <code>schedule_config.json</code>. Whenever you select this timezone in the future, these exact 5 slots will automatically load.
                    </span>
                  </div>
                  <button onClick={() => setScheduleSavedToast(false)} className="text-emerald-700 hover:text-emerald-900 text-xs">
                    ✕
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* 1. Target Timezone Selector (5 key timezones) */}
                <div className="space-y-1.5 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  <label htmlFor="timezone-select" className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-red-500" />
                    <span>Target Timezone (5 Key Target Timezones)</span>
                  </label>
                  <select
                    id="timezone-select"
                    value={scheduleConfig.target_timezone}
                    onChange={(e) => handleTimezoneChange(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-hidden focus:border-red-500"
                  >
                    {KEY_TARGET_TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>
                        {TIMEZONE_DISPLAY_NAMES[tz] || tz}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500">
                    Selecting a timezone instantly restores its own 5 custom schedule time slots.
                  </p>
                </div>

                {/* Save Schedule Preferences Button Panel */}
                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 flex flex-col justify-between">
                  <div>
                    <span className="block text-xs font-bold text-slate-800">Persistent Storage Connection</span>
                    <p className="text-[11px] text-slate-500 pt-1">
                      Save current slot times directly under <strong>{TIMEZONE_DISPLAY_NAMES[scheduleConfig.target_timezone] || scheduleConfig.target_timezone}</strong> in <code>schedule_config.json</code>.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={handleSaveSchedulePreferences}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Schedule Preferences</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 5 Static Time Slot Pickers */}
              <div className="pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span>5 Static Schedule Time Slots for:</span>
                    </span>
                    <span className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                      {TIMEZONE_DISPLAY_NAMES[scheduleConfig.target_timezone] || scheduleConfig.target_timezone}
                    </span>
                  </div>
                  <button
                    onClick={handleResetCurrentTimezoneSlots}
                    className="text-[11px] text-slate-400 hover:text-red-600 underline text-left sm:text-right"
                  >
                    Reset defaults for this timezone
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Time slots and timezone are connected: switching timezones automatically loads that timezone&apos;s saved slots.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {scheduleConfig.slots.map((slotTime, idx) => (
                    <div key={idx} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span>Slot {idx + 1}</span>
                        <span className="text-[9px] text-slate-400 font-mono">#{idx + 1}</span>
                      </div>
                      <input
                        type="time"
                        value={slotTime}
                        onChange={(e) => handleSlotChange(idx, e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-semibold text-slate-900 focus:border-red-500 outline-hidden"
                      />
                      <div className="text-[9px] text-slate-400">
                        {idx === 0 && "Default: 12:00 PM"}
                        {idx === 1 && "Default: 06:00 PM"}
                        {idx === 2 && "Default: 12:00 AM"}
                        {idx === 3 && "Default: 06:00 AM"}
                        {idx === 4 && "Default: 03:00 PM"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. UPLOAD BATCH & START DATE SELECTION */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-red-500" />
                  <h3 className="font-semibold text-slate-900 text-sm">
                    📅 Video Batch & Start Date
                  </h3>
                </div>
                <span className="text-xs text-slate-400">
                  Strict mapping: Video 1 ➔ Slot 1, Video 2 ➔ Slot 2, etc.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Dynamic Video Batch Count */}
                <div className="space-y-1.5 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <label htmlFor="batch-slider">Number of Videos to Upload</label>
                    <span className="px-2 py-0.5 bg-red-600 text-white rounded font-mono text-xs">
                      {batchCount} of {metadataRows.length}
                    </span>
                  </div>
                  <input
                    id="batch-slider"
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={batchCount}
                    onChange={(e) => setBatchCount(Number(e.target.value))}
                    className="w-full accent-red-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>Min: 1</span>
                    <span>Default: 3</span>
                    <span>Max: 5</span>
                  </div>
                </div>

                {/* Publish Start Date */}
                <div className="space-y-1.5 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  <label htmlFor="start-date-input" className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-red-500" />
                    <span>Publish Start Date</span>
                  </label>
                  <input
                    id="start-date-input"
                    type="date"
                    value={publishStartDate}
                    onChange={(e) => setPublishStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-hidden focus:border-red-500"
                  />
                  <p className="text-[10px] text-slate-400">Base starting date mapped directly to Slot 1</p>
                </div>
              </div>
            </div>

            {/* 2. INTERACTIVE PUBLISHING PREVIEW TABLE */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-red-500" />
                  <h3 className="font-semibold text-slate-900 text-sm">
                    📋 Interactive Publishing Preview ({currentBatchToProcess.length} of {metadataRows.length} Videos)
                  </h3>
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  Target: YouTube Data API v3 (publishAt)
                </div>
              </div>

              {metadataRows.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-3">
                  <FolderOpen className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-slate-600 font-medium text-sm">No videos found in staging_area/</div>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Please return to View 1 to upload MP4 videos and generate AI metadata first.
                  </p>
                  <button
                    onClick={() => setActiveView('view1')}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-xs"
                  >
                    Go to View 1 (Staging & Metadata)
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Cards Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {currentBatchToProcess.map((item, idx) => {
                      const sched = calculatedScheduleInfo[idx];
                      return (
                        <div
                          key={item.id}
                          className="border border-slate-200 hover:border-red-300 rounded-xl p-4 bg-slate-50/50 hover:bg-white transition space-y-3 flex flex-col justify-between"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded-full">
                                Video Slot {idx + 1} ({sched?.slotName})
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">Private</span>
                            </div>

                            <div className="font-mono text-xs font-bold text-slate-900 truncate">
                              {item.filename}
                            </div>

                            <div className="text-xs font-semibold text-slate-800 line-clamp-2">
                              {item.title}
                            </div>

                            <div className="text-[11px] text-teal-700 font-mono line-clamp-2 bg-teal-50 p-2 rounded border border-teal-100">
                              {item.hashtags}
                            </div>

                            <div className="text-[11px] text-slate-500 line-clamp-1">
                              <strong>Tags:</strong> {item.tags}
                            </div>
                          </div>

                          {/* Calculated Schedule Preview */}
                          <div className="pt-2 border-t border-slate-200 space-y-1">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                              <Clock className="w-3.5 h-3.5 text-amber-500" />
                              <span>Assigned Publish Timestamp:</span>
                            </div>
                            <div className="text-xs font-bold text-red-600">
                              {sched?.localDisplay}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200 truncate">
                              ISO 8601 UTC: <strong>{sched?.utcIso}</strong>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary Table */}
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="p-2.5 border-r border-slate-200">Video Slot</th>
                          <th className="p-2.5 border-r border-slate-200">Filename</th>
                          <th className="p-2.5 border-r border-slate-200">Assigned Publish Date</th>
                          <th className="p-2.5 border-r border-slate-200">Local Scheduled Time</th>
                          <th className="p-2.5">ISO 8601 UTC (publishAt)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white font-mono text-[11px]">
                        {currentBatchToProcess.map((item, idx) => {
                          const sched = calculatedScheduleInfo[idx];
                          return (
                            <tr key={item.id} className="hover:bg-slate-50">
                              <td className="p-2.5 border-r border-slate-200 font-sans font-semibold text-slate-800">
                                Video {idx + 1} ({sched?.slotName})
                              </td>
                              <td className="p-2.5 border-r border-slate-200 font-bold text-slate-900 truncate max-w-[160px]">
                                {item.filename}
                              </td>
                              <td className="p-2.5 border-r border-slate-200 text-slate-800 font-sans font-medium">
                                {sched?.publishDate}
                              </td>
                              <td className="p-2.5 border-r border-slate-200 text-slate-700 font-sans">
                                {sched?.localTime}
                              </td>
                              <td className="p-2.5 text-teal-700 font-bold">
                                {sched?.utcIso}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {metadataRows.length > batchCount && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center justify-between">
                      <span>
                        ℹ️ <strong>{metadataRows.length - batchCount}</strong> additional video(s) will remain staged for your next batch.
                      </span>
                      <span className="font-mono text-[11px] text-amber-700">
                        Batch limit: {batchCount}
                      </span>
                    </div>
                  )}

                  {/* EXECUTION & UPLOAD BUTTON */}
                  <div className="pt-2">
                    <button
                      id="auth-upload-btn"
                      onClick={handleAuthenticateAndUpload}
                      disabled={isUploadingYouTube}
                      className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-xs ${
                        isUploadingYouTube
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700 text-white hover:shadow-md active:scale-[0.99]'
                      }`}
                    >
                      {isUploadingYouTube ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-white" />
                          <span>Uploading & Scheduling Videos on YouTube...</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-4 h-4 text-amber-200" />
                          <span>🔑 Authenticate & Upload {currentBatchToProcess.length} Videos to YouTube</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* UPLOAD PROGRESS BAR */}
                  {isUploadingYouTube && (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-700 font-medium flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-500" />
                          {uploadStepText}
                        </span>
                        <span className="font-mono font-bold text-red-600">{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-red-600 h-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
