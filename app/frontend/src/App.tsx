import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  TextField,
  Button,
  Paper,
  Avatar,
  Chip,
  CircularProgress,
  IconButton,
  Card,
  CardContent,
  Logo,
  Switch,
  ThemeProvider,
  CssBaseline,
  theme as lightTheme,
  darkTheme,
} from "@skodaflow/web-library";
import { useTheme, useMediaQuery, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import { createTheme } from "@mui/material/styles";
import {
  MessageSquare,
  BookOpen,
  Activity,
  Settings,
  Send,
  Menu,
  Bot,
  User,
  Terminal,
  Server,
  ShieldCheck,
  ChevronRight,
  Code,
  X,
  Cloud,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

const drawerWidth = 280;
const EMERALD_GREEN = "#0E3A2F";
const ELECTRIC_GREEN = "#78FAAE";

type Message = {
  id: string;
  role: "user" | "model";
  text: string;
  planData?: TfPlanData;
};

type ViewState = "chat" | "guides" | "status" | "settings";

type Guide = {
  title: string;
  desc: string;
  icon: React.ReactNode;
  source: string;  // Firestore knowledge_base source key
};

const GUIDES: Guide[] = [
  {
    title: "Azure DevOps Access",
    desc: "Request a DMZ account to access the Skoda Azure DevOps environment.",
    icon: <Cloud size={24} />,
    source: "azure-devops-access",
  },
  {
    title: "Kubernetes Basics",
    desc: "Deploy your first app to the Skoda K8s cluster.",
    icon: <Server size={24} />,
    source: "kubernetes-basics",
  },
  {
    title: "GitLab CI/CD",
    desc: "Standard templates and best practices for pipelines.",
    icon: <Code size={24} />,
    source: "gitlab-cicd",
  },
  {
    title: "Security & SonarQube",
    desc: "Integrating SAST and DAST into your workflow.",
    icon: <ShieldCheck size={24} />,
    source: "security-sonarqube",
  },
  {
    title: "Nexus Artifacts",
    desc: "Publishing and consuming packages internally.",
    icon: <Terminal size={24} />,
    source: "nexus-artifacts",
  },
];

// ─── Terraform Plan visualisation ──────────────────────────────────────────────
type TfResource = {
  address: string;
  type: string;
  name: string;
  action: "create" | "destroy" | "update" | "replace" | "read";
  risks: string[];
};
type TfPlanData = {
  summary: { add: number; change: number; destroy: number };
  resources: TfResource[];
  total_changes: number;
};

const TF_ACTION: Record<string, { symbol: string; color: string; bg: string; label: string }> = {
  create:  { symbol: "+",  color: "#2da44e", bg: "rgba(45,164,78,0.12)",   label: "add"     },
  destroy: { symbol: "−",  color: "#cf222e", bg: "rgba(207,34,46,0.12)",  label: "destroy" },
  update:  { symbol: "~",  color: "#bf8700", bg: "rgba(212,167,44,0.12)",  label: "change"  },
  replace: { symbol: "±",  color: "#cf222e", bg: "rgba(207,34,46,0.12)",  label: "replace" },
  read:    { symbol: "→",  color: "#0969da", bg: "rgba(9,105,218,0.12)",  label: "read"    },
};

function isTerraformPlan(text: string): boolean {
  return (
    /Plan:\s+\d+ to add,\s+\d+ to change,\s+\d+ to destroy/i.test(text) ||
    (/Terraform will perform the following actions/i.test(text) && /Plan:/i.test(text))
  );
}

function TerraformPlanCard({ data, isDarkMode }: { data: TfPlanData; isDarkMode: boolean }) {
  const cardBg      = isDarkMode ? "rgba(255,255,255,0.04)" : "#f6f8fa";
  const borderColor = isDarkMode ? "rgba(255,255,255,0.12)" : "#d0d7de";
  const metaColor   = isDarkMode ? "rgba(255,255,255,0.45)" : "#57606a";

  const summaryRows = [
    { count: data.summary.add,     cfg: TF_ACTION.create  },
    { count: data.summary.change,  cfg: TF_ACTION.update  },
    { count: data.summary.destroy, cfg: TF_ACTION.destroy },
  ].filter(r => r.count > 0);

  return (
    <Box sx={{ mb: 2 }}>
      {/* header row */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: metaColor, mr: 0.5 }}
        >
          Terraform Plan
        </Typography>
        {summaryRows.map(({ count, cfg }) => (
          <Chip
            key={cfg.label}
            label={`${cfg.symbol} ${count} ${cfg.label}`}
            size="small"
            sx={{
              bgcolor: cfg.bg,
              color: cfg.color,
              fontWeight: 700,
              fontSize: "0.7rem",
              height: 22,
              fontFamily: "monospace",
              border: `1px solid ${cfg.color}44`,
            }}
          />
        ))}
        {data.resources.some(r => r.risks.length > 0) && (
          <Chip
            label="⚠️ risks detected"
            size="small"
            sx={{ bgcolor: "rgba(255,140,0,0.12)", color: "#e6820a", fontWeight: 600, fontSize: "0.7rem", height: 22 }}
          />
        )}
      </Box>

      {/* resource list */}
      <Box
        sx={{
          border: `1px solid ${borderColor}`,
          borderRadius: 2,
          overflow: "hidden",
          maxHeight: 340,
          overflowY: "auto",
          bgcolor: cardBg,
        }}
      >
        {data.resources.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">No resource changes detected.</Typography>
          </Box>
        ) : (
          data.resources.map((r, i) => {
            const cfg = TF_ACTION[r.action] ?? TF_ACTION.update;
            return (
              <Box
                key={r.address}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.5,
                  py: 0.75,
                  borderBottom: i < data.resources.length - 1 ? `1px solid ${borderColor}` : "none",
                  borderLeft: `3px solid ${cfg.color}`,
                }}
              >
                <Typography
                  sx={{ fontFamily: "monospace", fontSize: "1rem", fontWeight: 800, color: cfg.color, width: 18, flexShrink: 0 }}
                >
                  {cfg.symbol}
                </Typography>
                <Typography
                  sx={{
                    fontFamily: "'Fira Code', Consolas, monospace",
                    fontSize: "0.78rem",
                    color: isDarkMode ? "#e6edf3" : "#24292f",
                    flex: 1,
                    wordBreak: "break-all",
                  }}
                >
                  {r.address}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {r.risks.map(risk => (
                    <Chip
                      key={risk}
                      label={risk}
                      size="small"
                      sx={{ bgcolor: "rgba(255,140,0,0.12)", color: "#e6820a", fontWeight: 600, fontSize: "0.62rem", height: 18 }}
                    />
                  ))}
                </Box>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}

function AppContent({ isDarkMode, setIsDarkMode }: { isDarkMode: boolean; setIsDarkMode: (value: boolean) => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [view, setView] = useState<ViewState>("chat");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "model",
      text: "Hello! I am your **Skoda DevOps Copilot**. How can I help you onboard to our on-prem DevOps stack today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedGuide, setSelectedGuide] = useState<Guide | null>(null);
  const [guideContent, setGuideContent] = useState<string>("");
  const [guideLoading, setGuideLoading] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const primaryColor = isDarkMode ? ELECTRIC_GREEN : EMERALD_GREEN;
  const primaryHoverColor = isDarkMode ? EMERALD_GREEN : ELECTRIC_GREEN;
  const primaryTextColor = isDarkMode ? "black" : "white";
  const userAvatarBg = isDarkMode ? "rgba(255, 255, 255, 0.1)" : "grey.200";
  const userAvatarColor = isDarkMode ? "white" : "grey.800";
  const translucentPrimary = isDarkMode ? "rgba(120, 250, 174, 0.1)" : "rgba(14, 58, 47, 0.1)";
  
  const chatBg = isDarkMode ? "background.default" : "grey.50";
  const userBubbleBg = isDarkMode ? "rgba(255, 255, 255, 0.05)" : "grey.100";
  const modelBubbleBg = isDarkMode ? "background.paper" : "white";
  const bubbleBorder = isDarkMode ? "divider" : "grey.200";
  const inputBg = isDarkMode ? "background.paper" : "grey.50";
  const codeBg = isDarkMode ? "#0d1117" : "#f6f8fa";       // github dark / github light
  const codeColor = isDarkMode ? "#e6edf3" : "#24292f";    // light text / dark text
  const appBarBg = isDarkMode ? "background.paper" : "white";

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const openGuide = async (guide: Guide) => {
    setSelectedGuide(guide);
    setGuideContent("");
    setGuideLoading(true);
    try {
      const backendUrl = (import.meta as any).env?.VITE_BACKEND_URL || "";
      const res = await fetch(`${backendUrl}/api/v1/documents/${guide.source}`);
      if (res.ok) {
        const data = await res.json();
        setGuideContent(data.content);
      } else {
        setGuideContent(`> ⚠️ Could not load this guide (status ${res.status}). Please try again later.`);
      }
    } catch {
      setGuideContent("> ⚠️ Network error — could not reach the backend.");
    } finally {
      setGuideLoading(false);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      text,
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const backendUrl = (import.meta as any).env?.VITE_BACKEND_URL || "";

      const isPlan = isTerraformPlan(text);
      const chatPromise = fetch(`${backendUrl}/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          session_id: sessionIdRef.current || undefined,
          user_id: "anonymous",
        }),
      });
      const planPromise = isPlan
        ? fetch(`${backendUrl}/api/v1/terraform/plan`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan_output: text }),
          })
        : null;

      const [response, planResponse] = await Promise.all([chatPromise, planPromise]);

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      const planData: TfPlanData | undefined =
        planResponse?.ok ? await planResponse.json() : undefined;

      // Persist session_id for conversation continuity
      if (data.session_id) {
        sessionIdRef.current = data.session_id;
      }

      const newModelMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        text: data.message?.content || "Sorry, I could not generate a response.",
        planData,
      };

      setMessages((prev) => [...prev, newModelMessage]);
    } catch (error) {
      console.error("Error calling backend:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "model",
          text: "Sorry, I encountered an error while trying to process your request. Please try again later.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (actionText: string) => {
    setView("chat");
    handleSend(actionText);
  };

  const drawer = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar
        sx={{
          px: 2,
          display: "flex",
          alignItems: "center",
          gap: 2,
          height: 64,
        }}
      >
        <Logo variant="horizontal" width={120} color={isDarkMode ? "white" : "emerald"} subbrandText="IT" />
      </Toolbar>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ fontWeight: 600, letterSpacing: 1 }}
        >
          DevOps Copilot
        </Typography>
      </Box>
      <List sx={{ flexGrow: 1, px: 2, py: 0 }}>
        <ListItem disablePadding sx={{ mb: 1 }}>
          <ListItemButton
            selected={view === "chat"}
            onClick={() => setView("chat")}
            sx={{ borderRadius: 2 }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              <MessageSquare
                size={20}
                color={view === "chat" ? primaryColor : undefined}
              />
            </ListItemIcon>
            <ListItemText
              primary="Copilot Chat"
              primaryTypographyProps={{
                fontWeight: view === "chat" ? 600 : 400,
              }}
            />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding sx={{ mb: 1 }}>
          <ListItemButton
            selected={view === "guides"}
            onClick={() => setView("guides")}
            sx={{ borderRadius: 2 }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              <BookOpen
                size={20}
                color={view === "guides" ? primaryColor : undefined}
              />
            </ListItemIcon>
            <ListItemText
              primary="Onboarding Guides"
              primaryTypographyProps={{
                fontWeight: view === "guides" ? 600 : 400,
              }}
            />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding sx={{ mb: 1 }}>
          <ListItemButton
            selected={view === "status"}
            onClick={() => setView("status")}
            sx={{ borderRadius: 2 }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              <Activity
                size={20}
                color={view === "status" ? primaryColor : undefined}
              />
            </ListItemIcon>
            <ListItemText
              primary="System Status"
              primaryTypographyProps={{
                fontWeight: view === "status" ? 600 : 400,
              }}
            />
          </ListItemButton>
        </ListItem>
      </List>
      <Divider />
      <List sx={{ px: 2, py: 2 }}>
        <ListItem disablePadding>
          <ListItemButton
            selected={view === "settings"}
            onClick={() => setView("settings")}
            sx={{ borderRadius: 2 }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              <Settings
                size={20}
                color={view === "settings" ? primaryColor : undefined}
              />
            </ListItemIcon>
            <ListItemText primary="Settings" />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );

  const renderChat = () => (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box
        sx={{
          flexGrow: 1,
          overflowY: "auto",
          p: { xs: 2, md: 4 },
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        {messages.length === 1 && (
          <Box sx={{ mb: 4 }}>
            <Typography variant="h4" sx={{ mb: 1, fontWeight: 300 }}>
              Welcome to Skoda DevOps
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
              I can help you provision resources, troubleshoot pipelines, and
              understand our architecture.
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 2,
              }}
            >
              {[
                "How do I request access to the Kubernetes cluster?",
                "What is the standard CI/CD pipeline template?",
                "How to configure SonarQube for a Java project?",
                "Where can I find the Nexus registry credentials?",
              ].map((q, i) => (
                <Card
                  key={i}
                  variant="outlined"
                  sx={{
                    cursor: "pointer",
                    "&:hover": {
                      borderColor: primaryColor,
                      bgcolor: "action.hover",
                    },
                    transition: "all 0.2s",
                  }}
                  onClick={() => handleQuickAction(q)}
                >
                  <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                    <Typography
                      variant="body2"
                      sx={{ display: "flex", alignItems: "center", gap: 1 }}
                    >
                      <ChevronRight
                        size={16}
                        color={primaryColor}
                      />
                      {q}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Box>
        )}

        {messages.map((msg) => (
          <Box
            key={msg.id}
            sx={{
              display: "flex",
              gap: 2,
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              flexDirection: msg.role === "user" ? "row-reverse" : "row",
            }}
          >
            <Avatar
              sx={{
                bgcolor: msg.role === "user" ? userAvatarBg : primaryColor,
                color: msg.role === "user" ? userAvatarColor : primaryTextColor,
                width: 36,
                height: 36,
              }}
            >
              {msg.role === "user" ? <User size={20} /> : <Bot size={20} />}
            </Avatar>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 3,
                bgcolor: msg.role === "user" ? userBubbleBg : modelBubbleBg,
                border: "1px solid",
                borderColor: msg.role === "user" ? "transparent" : bubbleBorder,
                borderTopRightRadius: msg.role === "user" ? 4 : 24,
                borderTopLeftRadius: msg.role === "model" ? 4 : 24,
              }}
            >
              <Box
                className="markdown-body"
                sx={{
                  "& p": { m: 0, mb: 1, "&:last-child": { mb: 0 } },
                  "& pre": {
                    bgcolor: codeBg,
                    color: codeColor,
                    p: 2,
                    borderRadius: 2,
                    overflowX: "auto",
                    my: 2,
                    fontSize: "0.85rem",
                    lineHeight: 1.6,
                    border: isDarkMode ? "none" : "1px solid #d0d7de",
                  },
                  "& code": {
                    fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
                    bgcolor: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                    color: isDarkMode ? "#79c0ff" : "#d63200",
                    px: 0.7,
                    py: 0.3,
                    borderRadius: 1,
                    fontSize: "0.85em",
                  },
                  "& pre code": {
                    bgcolor: "transparent",
                    color: codeColor,
                    p: 0,
                    fontSize: "inherit",
                  },
                }}
              >
                {msg.planData && (
                  <TerraformPlanCard data={msg.planData} isDarkMode={isDarkMode} />
                )}
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </Box>
            </Paper>
          </Box>
        ))}
        {isLoading && (
          <Box sx={{ display: "flex", gap: 2, alignSelf: "flex-start" }}>
            <Avatar sx={{ bgcolor: primaryColor, color: primaryTextColor, width: 36, height: 36 }}>
              <Bot size={20} />
            </Avatar>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 3,
                border: "1px solid",
                borderColor: bubbleBorder,
                bgcolor: modelBubbleBg,
                borderTopLeftRadius: 4,
              }}
            >
              <CircularProgress size={20} />
            </Paper>
          </Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      <Box
        sx={{
          p: { xs: 2, md: 3 },
          bgcolor: "background.paper",
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          sx={{
            display: "flex",
            gap: 2,
            alignItems: "flex-end",
            maxWidth: "100%",
          }}
        >
          <TextField
            fullWidth
            multiline
            maxRows={4}
            placeholder="Ask Copilot about DevOps..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
            variant="outlined"
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 3,
                bgcolor: inputBg,
              },
            }}
          />
          <Button
            variant="contained"
            type="submit"
            disabled={!input.trim() || isLoading}
            sx={{
              minWidth: 56,
              width: 56,
              height: 56,
              borderRadius: 3,
              p: 0,
              bgcolor: primaryColor,
              color: primaryTextColor,
              "&:hover": {
                bgcolor: primaryHoverColor,
                color: isDarkMode ? "white" : "black",
              },
              "&.Mui-disabled": {
                bgcolor: isDarkMode ? "action.disabledBackground" : "grey.300",
                color: isDarkMode ? "action.disabled" : "grey.500",
              },
            }}
          >
            <Send size={20} />
          </Button>
        </Box>
      </Box>
    </Box>
  );

  const renderGuides = () => (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 300 }}>
        Onboarding Guides
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" },
          gap: 3,
        }}
      >
        {GUIDES.map((guide, i) => (
          <Card
            key={i}
            variant="outlined"
            sx={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              cursor: "pointer",
              transition: "box-shadow 0.2s, border-color 0.2s",
              "&:hover": { boxShadow: 4, borderColor: primaryColor },
            }}
          >
            <CardContent sx={{ flexGrow: 1 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: translucentPrimary,
                  color: primaryColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mb: 2,
                }}
              >
                {guide.icon}
              </Box>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {guide.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {guide.desc}
              </Typography>
            </CardContent>
            <Box sx={{ p: 2, pt: 0 }}>
              <Button
                variant="text"
                endIcon={<ChevronRight size={16} />}
                onClick={() => openGuide(guide)}
                sx={{ color: primaryColor }}
              >
                Read Guide
              </Button>
            </Box>
          </Card>
        ))}
      </Box>

      {/* ── Guide Article Dialog ── */}
      <Dialog
        open={!!selectedGuide}
        onClose={() => { setSelectedGuide(null); setGuideContent(""); }}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, bgcolor: "background.paper" } }}
      >
        <DialogTitle
          component="div"
          sx={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            borderBottom: "1px solid",
            borderColor: "divider",
            p: 2.5,
            gap: 1.5,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flex: 1, minWidth: 0 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                bgcolor: translucentPrimary,
                color: primaryColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {selectedGuide?.icon}
            </Box>
            <Typography variant="h6" fontWeight={600} sx={{ lineHeight: 1.3, wordBreak: "break-word" }}>
              {selectedGuide?.title}
            </Typography>
          </Box>
          <IconButton
            onClick={() => { setSelectedGuide(null); setGuideContent(""); }}
            size="small"
            sx={{ flexShrink: 0, mt: 0.25 }}
          >
            <X size={20} />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 3 }}>
          <Box
            sx={{
              "& h1": { typography: "h5", fontWeight: 700, mb: 2, mt: 1 },
              "& h2": { typography: "h6", fontWeight: 600, mb: 1.5, mt: 3, color: primaryColor },
              "& h3": { typography: "subtitle1", fontWeight: 600, mb: 1, mt: 2 },
              "& p": { mb: 1.5, lineHeight: 1.8 },
              "& ul, & ol": { pl: 3, mb: 1.5 },
              "& li": { mb: 0.5 },
              "& table": { width: "100%", borderCollapse: "collapse", mb: 2 },
              "& th": { bgcolor: translucentPrimary, p: 1, textAlign: "left", fontWeight: 600, border: "1px solid", borderColor: "divider" },
              "& td": { p: 1, border: "1px solid", borderColor: "divider" },
              "& pre": {
                bgcolor: isDarkMode ? "#0d1117" : "#f6f8fa",
                color: isDarkMode ? "#e6edf3" : "#24292f",
                p: 2,
                borderRadius: 2,
                overflowX: "auto",
                my: 2,
                fontSize: "0.85rem",
                lineHeight: 1.6,
                border: isDarkMode ? "none" : "1px solid #d0d7de",
              },
              "& code": {
                fontFamily: "'Fira Code', 'Consolas', monospace",
                bgcolor: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                color: isDarkMode ? "#79c0ff" : "#d63200",
                px: 0.7,
                py: 0.3,
                borderRadius: 1,
                fontSize: "0.85em",
              },
              "& pre code": {
                bgcolor: "transparent",
                color: isDarkMode ? "#e6edf3" : "#24292f",
                p: 0,
                fontSize: "inherit",
              },
              "& strong": { fontWeight: 700 },
            }}
          >
            {guideLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress />
              </Box>
            ) : (
              <ReactMarkdown>{guideContent}</ReactMarkdown>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ borderTop: "1px solid", borderColor: "divider", px: 3, py: 2 }}>
          <Button
            variant="contained"
            onClick={() => { setSelectedGuide(null); setGuideContent(""); }}
            sx={{ bgcolor: primaryColor, color: primaryTextColor, "&:hover": { opacity: 0.9 } }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

  const renderStatus = () => (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 300 }}>
        System Status
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 3,
        }}
      >
        {[
          { name: "Kubernetes Cluster (Prod)", status: "Operational", color: "success" },
          { name: "Kubernetes Cluster (Non-Prod)", status: "Operational", color: "success" },
          { name: "GitLab", status: "Degraded Performance", color: "warning" },
          { name: "Nexus Repository", status: "Operational", color: "success" },
          { name: "SonarQube", status: "Operational", color: "success" },
          { name: "ArgoCD", status: "Operational", color: "success" },
        ].map((sys, i) => (
          <Paper
            key={i}
            variant="outlined"
            sx={{
              p: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderRadius: 2,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Server size={24} color={theme.palette.text.secondary} />
              <Typography variant="subtitle1" fontWeight={500}>
                {sys.name}
              </Typography>
            </Box>
            <Chip
              label={sys.status}
              color={sys.color as any}
              size="small"
              sx={{ fontWeight: 600, borderRadius: 1 }}
            />
          </Paper>
        ))}
      </Box>
    </Box>
  );

  const renderSettings = () => (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 600 }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 300 }}>
        Settings
      </Typography>
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Profile
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
            <Avatar sx={{ width: 64, height: 64, bgcolor: primaryColor, color: primaryTextColor }}>
              JD
            </Avatar>
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                John Doe
              </Typography>
              <Typography variant="body2" color="text.secondary">
                DevOps Engineer
              </Typography>
            </Box>
          </Box>
          <Divider sx={{ my: 2 }} />
          <Typography variant="h6" sx={{ mb: 2 }}>
            Preferences
          </Typography>
          <List disablePadding>
            <ListItem disablePadding sx={{ py: 1 }}>
              <ListItemText
                primary="Email Notifications"
                secondary="Receive alerts for pipeline failures"
              />
              <Chip label="Enabled" color="success" size="small" />
            </ListItem>
            <ListItem disablePadding sx={{ py: 1 }}>
              <ListItemText
                primary="Dark Mode"
                secondary="Use dark theme across the application"
              />
              <Switch
                checked={isDarkMode}
                onChange={(e) => setIsDarkMode(e.target.checked)}
                color="primary"
              />
            </ListItem>
          </List>
        </CardContent>
      </Card>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", height: "100vh", bgcolor: chatBg }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          bgcolor: appBarBg,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Toolbar sx={{ minHeight: 64, height: 64 }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: "none" } }}
          >
            <Menu />
          </IconButton>
          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{ flexGrow: 1, fontWeight: 500 }}
          >
            {view === "chat" && "Copilot Chat"}
            {view === "guides" && "Onboarding Guides"}
            {view === "status" && "System Status"}
            {view === "settings" && "Settings"}
          </Typography>
          <Avatar
            sx={{
              bgcolor: primaryColor,
              color: primaryTextColor,
              width: 32,
              height: 32,
              fontSize: "0.875rem",
            }}
          >
            JD
          </Avatar>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
        aria-label="mailbox folders"
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": { boxSizing: "border-box", width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
              borderRight: "1px solid",
              borderColor: "divider",
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          display: "flex",
          flexDirection: "column",
          pt: "64px",
        }}
      >
        {view === "chat" && renderChat()}
        {view === "guides" && renderGuides()}
        {view === "status" && renderStatus()}
        {view === "settings" && renderSettings()}
      </Box>
    </Box>
  );
}

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toolbarHeightOverride = {
    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: "64px !important",
          height: 64,
          "@media (min-width: 0px)": { minHeight: "64px !important" },
          "@media (min-width: 600px)": { minHeight: "64px !important" },
        },
      },
    },
  };

  const customLightTheme = createTheme({
    ...lightTheme,
    components: {
      ...lightTheme.components,
      ...toolbarHeightOverride,
    },
  });

  const customDarkTheme = createTheme({
    ...darkTheme,
    palette: {
      ...darkTheme.palette,
      mode: "dark",
      background: {
        default: "#0A2921",
        paper: EMERALD_GREEN,
      },
      primary: {
        main: ELECTRIC_GREEN,
      },
      text: {
        primary: "#FFFFFF",
        secondary: "rgba(255, 255, 255, 0.7)",
      },
      divider: "rgba(120, 250, 174, 0.2)",
      action: {
        ...darkTheme.palette?.action,
        hover: "rgba(120, 250, 174, 0.1)",
        selected: "rgba(120, 250, 174, 0.15)",
        disabled: "rgba(255, 255, 255, 0.3)",
        disabledBackground: "rgba(255, 255, 255, 0.12)",
      },
    },
    components: {
      ...darkTheme.components,
      ...toolbarHeightOverride,
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: { backgroundImage: "none" },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundColor: EMERALD_GREEN, backgroundImage: "none" },
        },
      },
    },
  });

  const currentTheme = isDarkMode ? customDarkTheme : customLightTheme;

  return (
    <ThemeProvider theme={currentTheme}>
      <CssBaseline />
      <AppContent isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
    </ThemeProvider>
  );
}
