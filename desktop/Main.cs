using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: System.Reflection.AssemblyTitle("对话手记")]
[assembly: System.Reflection.AssemblyVersion("1.1.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.1.0.0")]

namespace ConversationNotes
{
    internal static class Json
    {
        internal static string Encode(object value) { return new JavaScriptSerializer { MaxJsonLength = 2000000 }.Serialize(value); }
        internal static Dictionary<string, object> Decode(string value)
        {
            return new JavaScriptSerializer { MaxJsonLength = 2000000 }.Deserialize<Dictionary<string, object>>(value);
        }
        internal static string Text(Dictionary<string, object> value, string name, string fallback = "")
        {
            object found;
            return value != null && value.TryGetValue(name, out found) && found is string ? (string)found : fallback;
        }
    }

    internal sealed class ApiException : Exception
    {
        internal readonly int Status;
        internal ApiException(int status, string message) : base(message) { Status = status; }
    }

    internal sealed class ConfigStore
    {
        private readonly string path;
        private readonly object gate = new object();
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("conversation-notes-windows-v1");
        internal ConfigStore(string directory) { Directory.CreateDirectory(directory); path = Path.Combine(directory, "config.dpapi"); }
        internal Dictionary<string, object> Read()
        {
            lock (gate)
            {
                if (!File.Exists(path)) return new Dictionary<string, object>();
                try
                {
                    if (new FileInfo(path).Length > 32768) throw new InvalidDataException();
                    byte[] plain = ProtectedData.Unprotect(File.ReadAllBytes(path), Entropy, DataProtectionScope.CurrentUser);
                    try { return Json.Decode(Encoding.UTF8.GetString(plain)); }
                    finally { Array.Clear(plain, 0, plain.Length); }
                }
                catch { throw new ApiException(503, "本机 API 配置无法解密。请在设置中重新填写 Key；聊天记录没有改动。"); }
            }
        }
        internal static string Model(string provider)
        {
            return provider == "openrouter" ? "typesafe/jev-1.13" : provider == "vercel" ? "typesafe-ai/jev" : "jev-1.13.0";
        }
        internal object Status()
        {
            Dictionary<string, object> config = Read();
            string provider = Json.Text(config, "provider", "typesafe");
            return new { configured = Json.Text(config, "apiKey").Length > 0, provider = provider, model = Model(provider) };
        }
        internal object Configure(Dictionary<string, object> input)
        {
            lock (gate)
            {
                string provider = Json.Text(input, "provider", "typesafe").Trim().ToLowerInvariant();
                if (provider != "typesafe" && provider != "vercel" && provider != "openrouter")
                    throw new ApiException(400, "平台只支持 TypeSafe、Vercel 和 OpenRouter。");
                string key = Json.Text(input, "apiKey").Trim();
                if (key.Length == 0)
                {
                    Dictionary<string, object> old = Read();
                    if (provider == Json.Text(old, "provider")) key = Json.Text(old, "apiKey");
                }
                if (key.Length == 0) throw new ApiException(400, "请先填写这个平台的 API Key。");
                if (key.Length > 4096 || Regex.IsMatch(key, "^(your[_-].*|replace[_-].*|xxx+|<.*>)$", RegexOptions.IgnoreCase)
                    || Regex.IsMatch(key, "[\\s\\x00-\\x1f\\x7f\"'`=]"))
                    throw new ApiException(400, "只粘贴 Key 本身，不要带变量名、引号或 Bearer。");
                if (key.StartsWith("sk-or-", StringComparison.Ordinal) && provider != "openrouter")
                    throw new ApiException(400, "这看起来是 OpenRouter Key，请选择 OpenRouter。");
                byte[] plain = Encoding.UTF8.GetBytes(Json.Encode(new { provider = provider, apiKey = key }));
                byte[] encrypted;
                try { encrypted = ProtectedData.Protect(plain, Entropy, DataProtectionScope.CurrentUser); }
                finally { Array.Clear(plain, 0, plain.Length); }
                string temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
                try
                {
                    File.WriteAllBytes(temporary, encrypted);
                    if (File.Exists(path)) File.Replace(temporary, path, null);
                    else File.Move(temporary, path);
                }
                finally { if (File.Exists(temporary)) File.Delete(temporary); }
                return Status();
            }
        }
        internal object Import(string file)
        {
            if (new FileInfo(file).Length > 65536) throw new ApiException(400, "配置文件过大，请选择旧版项目的 .env 文件。");
            Dictionary<string, string> env = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (string raw in File.ReadAllLines(file, Encoding.UTF8))
            {
                Match match = Regex.Match(raw.TrimStart('\uFEFF'), "^\\s*(?:export\\s+)?([A-Z_][A-Z0-9_]*)\\s*=\\s*(.*)$");
                if (!match.Success) continue;
                string value = match.Groups[2].Value.Trim();
                if (value.Length >= 2 && (value[0] == '\"' || value[0] == '\''))
                {
                    int end = value.IndexOf(value[0], 1);
                    value = end > 0 ? value.Substring(1, end - 1) : value;
                }
                else { int comment = value.IndexOf('#'); if (comment >= 0) value = value.Substring(0, comment).Trim(); }
                env[match.Groups[1].Value] = value;
            }
            string provider;
            if (!env.TryGetValue("JEV_PROVIDER", out provider) || provider.Trim().Length == 0) provider = "typesafe";
            provider = provider.Trim().ToLowerInvariant();
            string key;
            if (!env.TryGetValue("JEV_API_KEY", out key) || key.Length == 0)
                env.TryGetValue(provider == "vercel" ? "AI_GATEWAY_API_KEY" : provider == "openrouter" ? "OPENROUTER_API_KEY" : "TYPESAFE_API_KEY", out key);
            return Configure(new Dictionary<string, object> { { "provider", provider }, { "apiKey", key ?? "" } });
        }
    }

    internal static class OfficialLinks
    {
        internal static bool IsAllowed(string value, IEnumerable<string> allowed)
        {
            Uri uri;
            if (String.IsNullOrEmpty(value) || value.Length > 2048 || !Uri.TryCreate(value, UriKind.Absolute, out uri)
                || uri.Scheme != "https" || !uri.IsDefaultPort || uri.UserInfo.Length > 0 || uri.Fragment.Length > 0) return false;
            foreach (string link in allowed) if (String.Equals(link, value, StringComparison.Ordinal)) return true;
            return false;
        }
        internal static object Open(string value)
        {
            string file = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "official-links.json");
            string[] allowed = new JavaScriptSerializer().Deserialize<string[]>(File.ReadAllText(file));
            if (!IsAllowed(value, allowed)) throw new ApiException(400, "只允许打开已核对的供应商官方入口。");
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(value) { UseShellExecute = true });
            return new { opened = true };
        }
    }

    internal sealed class ModelClient : IDisposable
    {
        private readonly ConfigStore store;
        private readonly HttpClient client;
        private readonly object budgetLock = new object();
        private DateTime minuteAt = DateTime.MinValue, hourAt = DateTime.MinValue;
        private int minuteCalls, hourCalls;
        internal ModelClient(ConfigStore store, HttpClient testingClient = null)
        {
            this.store = store;
            client = testingClient ?? new HttpClient(new HttpClientHandler { AllowAutoRedirect = false });
            client.Timeout = TimeSpan.FromSeconds(30);
        }
        private void TakeBudget()
        {
            lock (budgetLock)
            {
                DateTime now = DateTime.UtcNow;
                if ((now - minuteAt).TotalSeconds >= 60) { minuteAt = now; minuteCalls = 0; }
                if ((now - hourAt).TotalHours >= 1) { hourAt = now; hourCalls = 0; }
                if (minuteCalls >= 180 || hourCalls >= 3000) throw new ApiException(429, "请求较多，进度已保留，请稍后继续。");
                minuteCalls++; hourCalls++;
            }
        }
        internal static string Endpoint(string provider)
        {
            if (provider == "typesafe") return "https://api.typesafe.ai/v1/systemone";
            if (provider == "vercel") return "https://ai-gateway.vercel.sh/typesafe/v1/systemone";
            if (provider == "openrouter") return "https://openrouter.ai/api/alpha/decisions";
            throw new ApiException(400, "服务平台不受支持，请重新保存配置。");
        }
        internal async Task<object> Evaluate(Dictionary<string, object> payload, CancellationToken token)
        {
            TakeBudget();
            Dictionary<string, object> config = store.Read();
            string key = Json.Text(config, "apiKey"), provider = Json.Text(config, "provider", "typesafe");
            if (key.Length == 0) throw new ApiException(503, "请先在聊天设置中配置 API Key。");
            object state, questions;
            if (!payload.TryGetValue("state", out state) ||
                !((state is string && !String.IsNullOrWhiteSpace((string)state)) ||
                  (state is Dictionary<string, object> && ((Dictionary<string, object>)state).Count > 0)) ||
                !payload.TryGetValue("questions", out questions) || !(questions is Dictionary<string, object>))
                throw new ApiException(400, "分析请求格式不正确，请重试。");
            string body = Json.Encode(new { state = state, questions = questions, model = ConfigStore.Model(provider) });
            if (Encoding.UTF8.GetByteCount(body) > 2000000) throw new ApiException(413, "聊天过长，请缩小范围。");
            using (CancellationTokenSource deadline = CancellationTokenSource.CreateLinkedTokenSource(token))
            {
                deadline.CancelAfter(TimeSpan.FromSeconds(45));
                for (int attempt = 0; ; attempt++)
                {
                    deadline.Token.ThrowIfCancellationRequested();
                    using (HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, Endpoint(provider)))
                    {
                        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", key);
                        request.Content = new StringContent(body, Encoding.UTF8, "application/json");
                        using (HttpResponseMessage response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadline.Token))
                        {
                            int code = (int)response.StatusCode;
                            if (!response.IsSuccessStatusCode)
                            {
                                double seconds = 0.4;
                                if (response.Headers.RetryAfter != null)
                                    seconds = response.Headers.RetryAfter.Delta.HasValue ? response.Headers.RetryAfter.Delta.Value.TotalSeconds
                                        : response.Headers.RetryAfter.Date.HasValue ? (response.Headers.RetryAfter.Date.Value - DateTimeOffset.UtcNow).TotalSeconds : 0.4;
                                if (attempt == 0 && (code == 429 || code == 503 || code == 529) && seconds <= 3)
                                { await Task.Delay(TimeSpan.FromSeconds(Math.Max(0.1, seconds)), deadline.Token); continue; }
                                // Never return provider bodies: they can echo keys or private text.
                                throw new ApiException(code >= 400 && code < 600 ? code : 502, ErrorMessage(code, provider));
                            }
                            try { return Json.Decode(await ReadBody(response, deadline.Token)); }
                            catch (OperationCanceledException) { throw; }
                            catch { throw new ApiException(502, "模型返回格式异常，请重试。"); }
                        }
                    }
                }
            }
        }
        private static async Task<string> ReadBody(HttpResponseMessage response, CancellationToken token)
        {
            if (response.Content.Headers.ContentLength > 2000000) throw new InvalidDataException();
            using (Stream source = await response.Content.ReadAsStreamAsync())
            using (MemoryStream result = new MemoryStream())
            {
                byte[] buffer = new byte[16384];
                int count;
                while ((count = await source.ReadAsync(buffer, 0, buffer.Length, token)) > 0)
                {
                    if (result.Length + count > 2000000) throw new InvalidDataException();
                    result.Write(buffer, 0, count);
                }
                return Encoding.UTF8.GetString(result.ToArray());
            }
        }
        private static string ErrorMessage(int code, string provider)
        {
            string reason = code == 401 ? "Key 无效或已过期，请在设置中更新。"
                : code == 402 ? "额度不足，请检查账号余额或计费设置。"
                : code == 403 ? "没有模型调用权限；Vercel 账号可能需要信用卡验证。"
                : code == 404 ? "模型或接口暂不可用，请稍后重试。"
                : code == 413 ? "聊天过长，请缩小范围。"
                : code == 429 ? "请求受限，请稍后重试并检查账号限额。"
                : code == 400 || code == 422 ? "请求未被接受，请检查配置或缩小范围。"
                : "模型服务暂不可用，请稍后重试。";
            return provider + "：" + reason;
        }
        public void Dispose() { client.Dispose(); }
    }

    internal sealed class NotebookWindow : Form
    {
        private const string Origin = "https://notebook.local";
        private readonly string dataRoot;
        private readonly WebView2 web = new WebView2();
        private readonly ConfigStore config;
        private readonly ModelClient model;
        private readonly ConcurrentDictionary<string, CancellationTokenSource> jobs = new ConcurrentDictionary<string, CancellationTokenSource>();
        internal NotebookWindow(string dataRoot, HttpClient testingClient = null)
        {
            this.dataRoot = dataRoot;
            config = new ConfigStore(dataRoot);
            model = new ModelClient(config, testingClient);
            Text = "对话手记";
            Size = new Size(1240, 850);
            MinimumSize = new Size(750, 560);
            StartPosition = FormStartPosition.CenterScreen;
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(246, 245, 244);
            string icon = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "notebook.ico");
            if (File.Exists(icon)) Icon = new Icon(icon);
            web.Dock = DockStyle.Fill;
            web.DefaultBackgroundColor = BackColor;
            Controls.Add(web);
            Shown += async delegate { await Initialize(); };
            FormClosing += delegate { foreach (CancellationTokenSource job in jobs.Values) job.Cancel(); };
            FormClosed += delegate { web.Dispose(); model.Dispose(); };
        }
        private static bool IsLocal(string url)
        {
            Uri uri;
            return Uri.TryCreate(url, UriKind.Absolute, out uri) && uri.Scheme == "https" && uri.Host == "notebook.local" && uri.IsDefaultPort;
        }
        private async Task Initialize()
        {
            try
            {
                CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(dataRoot, "WebView"));
                await web.EnsureCoreWebView2Async(environment);
                CoreWebView2 core = web.CoreWebView2;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.IsPasswordAutosaveEnabled = false;
                core.Settings.IsGeneralAutofillEnabled = false;
                core.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs args) { args.State = CoreWebView2PermissionState.Deny; };
                core.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs args) { args.Handled = true; };
                core.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs args) { if (!IsLocal(args.Uri)) args.Cancel = true; };
                core.SetVirtualHostNameToFolderMapping("notebook.local", Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "www"), CoreWebView2HostResourceAccessKind.DenyCors);
                core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
                core.WebResourceRequested += delegate(object sender, CoreWebView2WebResourceRequestedEventArgs args)
                {
                    if (!IsLocal(args.Request.Uri))
                        args.Response = environment.CreateWebResourceResponse(new MemoryStream(new byte[0]), 403, "Forbidden", "Content-Type: text/plain\r\n");
                };
                core.WebMessageReceived += Receive;
                core.DownloadStarting += delegate(object sender, CoreWebView2DownloadStartingEventArgs args)
                {
                    using (SaveFileDialog picker = new SaveFileDialog { FileName = Path.GetFileName(args.ResultFilePath), OverwritePrompt = true })
                    {
                        if (picker.ShowDialog(this) != DialogResult.OK) args.Cancel = true;
                        else args.ResultFilePath = picker.FileName;
                        args.Handled = true;
                    }
                };
                core.Navigate(Origin + "/index.html");
            }
            catch (WebView2RuntimeNotFoundException)
            {
                MessageBox.Show(this, "需要 Microsoft Edge WebView2 Runtime。请从微软官网安装后重新打开。\nhttps://developer.microsoft.com/microsoft-edge/webview2/", "缺少运行组件", MessageBoxButtons.OK, MessageBoxIcon.Information);
                Close();
            }
            catch
            {
                MessageBox.Show(this, "应用初始化失败，请重新打开；如仍失败，请检查安装文件和本机存储空间。", "对话手记", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }
        private async void Receive(object sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            if (!IsLocal(args.Source)) return;
            string id = "";
            CancellationTokenSource cancellation = null;
            bool registered = false;
            try
            {
                Dictionary<string, object> message = Json.Decode(args.WebMessageAsJson);
                id = Json.Text(message, "id");
                Guid parsed;
                if (!Guid.TryParse(id, out parsed)) return;
                string method = Json.Text(message, "method");
                if (method == "cancel")
                {
                    CancellationTokenSource running;
                    if (jobs.TryGetValue(id, out running)) running.Cancel();
                    return;
                }
                if (jobs.Count >= 8) throw new ApiException(429, "正在处理较多请求，请稍后重试。");
                cancellation = new CancellationTokenSource();
                if (!jobs.TryAdd(id, cancellation)) return;
                registered = true;
                object raw;
                Dictionary<string, object> payload = message.TryGetValue("payload", out raw) ? raw as Dictionary<string, object> : null;
                payload = payload ?? new Dictionary<string, object>();
                object result;
                if (method == "status") result = config.Status();
                else if (method == "configure") result = config.Configure(payload);
                else if (method == "importConfig")
                {
                    using (OpenFileDialog picker = new OpenFileDialog { Title = "选择旧版项目的 .env 配置文件", Filter = "环境配置文件|.env;*.env|所有文件|*.*", CheckFileExists = true })
                        result = picker.ShowDialog(this) == DialogResult.OK ? config.Import(picker.FileName) : null;
                }
                else if (method == "evaluate") result = await model.Evaluate(payload, cancellation.Token);
                else if (method == "openExternal") result = OfficialLinks.Open(Json.Text(payload, "url"));
                else throw new ApiException(400, "不支持的操作。");
                Reply(id, true, result);
            }
            catch (ApiException error) { Reply(id, false, new { status = error.Status, error = error.Message }); }
            catch (OperationCanceledException) { Reply(id, false, new { status = 499, error = "分析已停止或连接超时，请稍后继续。" }); }
            catch { Reply(id, false, new { status = 502, error = "操作失败，请检查网络与本机存储后重试。" }); }
            finally
            {
                if (cancellation != null)
                {
                    if (registered)
                    {
                        CancellationTokenSource removed;
                        jobs.TryRemove(id, out removed);
                    }
                    cancellation.Dispose();
                }
            }
        }
        private void Reply(string id, bool ok, object value)
        {
            if (!IsDisposed && web.CoreWebView2 != null)
                web.CoreWebView2.PostWebMessageAsJson(Json.Encode(new { id = id, ok = ok, value = value }));
        }
    }

    internal static class Program
    {
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindow(string className, string title);
        [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
        [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr window, int command);
        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            ServicePointManager.DefaultConnectionLimit = 8;
            string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ConversationNotes");
#if DESKTOP_QA
            if (args.Length != 2 || args[0] != "--test-profile") throw new InvalidOperationException("QA requires an isolated test profile.");
            data = Path.GetFullPath(args[1]);
#endif
            string identity = System.Security.Principal.WindowsIdentity.GetCurrent().User.Value;
            bool first;
            using (Mutex instance = new Mutex(true, "Local\\ConversationNotes-" + identity + "-" + data.GetHashCode(), out first))
            {
                if (!first)
                {
                    IntPtr previous = FindWindow(null, "对话手记");
                    if (previous != IntPtr.Zero) { ShowWindow(previous, 9); SetForegroundWindow(previous); }
                    return;
                }
                try { Application.Run(new NotebookWindow(data)); }
                catch { MessageBox.Show("应用启动失败，请检查本机存储空间后重试。", "对话手记", MessageBoxButtons.OK, MessageBoxIcon.Error); }
            }
        }
    }
}
