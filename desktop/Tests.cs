using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace ConversationNotes
{
    internal static class DesktopTests
    {
        private static int checks;
        private static void Check(bool ok, string name)
        {
            if (!ok) throw new Exception("Test failed: " + name);
            checks++;
        }
        private static Dictionary<string, object> Input(string provider, string key)
        { return new Dictionary<string, object> { { "provider", provider }, { "apiKey", key } }; }
        private static void Reject(Action action, int status, string name)
        {
            try { action(); throw new Exception("Expected rejection: " + name); }
            catch (ApiException error) { Check(error.Status == status, name); }
        }
        private static readonly string TestKey = "unit-test-not-a-real-key-" + Guid.NewGuid().ToString("N");
        private sealed class FakeHttp : HttpMessageHandler
        {
            internal Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> Run;
            protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) { return Run(request, token); }
        }
        private static Dictionary<string, object> Payload()
        {
            return new Dictionary<string, object> {
                { "state", "This is only an offline unit test." },
                { "questions", new Dictionary<string, object> { { "a", new { type = "noul", instructions = "Test" } } } }
            };
        }
        private static Dictionary<string, object> StructuredPayload()
        {
            // Match the actual WebView message, including object state and instructions.
            Dictionary<string, object> wire = Json.Decode("{\"id\":\"00000000-0000-0000-0000-000000000001\",\"method\":\"evaluate\",\"payload\":{\"state\":{\"relationship\":\"普通沟通\",\"messages\":[{\"id\":\"0\",\"sender\":\"other\",\"text\":\"你好\"},{\"id\":\"1\",\"sender\":\"self\",\"text\":\"收到\"}]},\"questions\":{\"a\":{\"type\":\"noul\",\"instructions\":{\"question\":\"Test\",\"continuation\":[]}}}}}");
            return (Dictionary<string, object>)wire["payload"];
        }
        private static async Task Run(string folder)
        {
            ConfigStore store = new ConfigStore(folder);
            string[] official = new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<string[]>(File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "official-links.json")));
            foreach (string link in official) Check(OfficialLinks.IsAllowed(link, official), "official link allowed");
            foreach (string link in new[] { "https://example.com", "http://console.typesafe.ai/keys", "javascript:alert(1)", "file:///C:/Windows", "https://console.typesafe.ai.evil.example/keys", "https://console.typesafe.ai/keys?apiKey=synthetic", "https://console.typesafe.ai/keys#private", "https://user@console.typesafe.ai/keys" })
                Check(!OfficialLinks.IsAllowed(link, official), "non-official or modified link rejected");
            Check(!Json.Encode(store.Status()).Contains("apiKey"), "status never includes key");
            Check(Json.Encode(store.Status()).Contains("false"), "empty configuration");
            store.Configure(Input("typesafe", TestKey));
            Check(Json.Text(store.Read(), "apiKey") == TestKey, "DPAPI round trip");
            Check(!System.Text.Encoding.UTF8.GetString(File.ReadAllBytes(Path.Combine(folder, "config.dpapi"))).Contains(TestKey), "no plaintext key on disk");
            Check(!Json.Encode(store.Status()).Contains(TestKey), "configured status does not leak key");
            store.Configure(Input("typesafe", ""));
            Check(Json.Text(store.Read(), "apiKey") == TestKey, "blank retains same-provider key");
            string deepKey = "synthetic-deepseek-key";
            store.Configure(new Dictionary<string, object> { { "provider", "deepseek" }, { "apiKey", deepKey }, { "model", "deepseek-flash" } });
            store.Configure(new Dictionary<string, object> { { "provider", "deepseek" }, { "apiKey", "" }, { "model", "deepseek-v4-pro" } });
            Check(Json.Text(store.Read(), "apiKey") == deepKey && Json.Text(store.Read(), "model") == "deepseek-v4-pro", "DeepSeek model switch keeps its own key");
            ConfigStore restarted = new ConfigStore(folder);
            Check(Json.Text(restarted.Read(), "model") == "deepseek-v4-pro", "model selection persists across restart");
            Check(!Json.Encode(store.Status()).Contains(deepKey) && !Json.Encode(store.Status()).Contains(TestKey), "profile summaries never return keys");
            string beforeInvalid = Convert.ToBase64String(File.ReadAllBytes(Path.Combine(folder, "config.dpapi")));
            Reject(() => store.Configure(new Dictionary<string, object> { { "provider", "deepseek" }, { "apiKey", "" }, { "model", "jev-1.13.0" } }), 400, "wrong-provider model rejected");
            Check(Convert.ToBase64String(File.ReadAllBytes(Path.Combine(folder, "config.dpapi"))) == beforeInvalid, "invalid switch leaves saved config intact");
            store.Configure(Input("typesafe", ""));
            Check(Json.Text(store.Read(), "apiKey") == TestKey, "switching back restores the Jev key");
            string legacyFolder = Path.Combine(folder, "legacy");
            ConfigStore legacy = new ConfigStore(legacyFolder);
            byte[] legacyBytes = System.Security.Cryptography.ProtectedData.Protect(System.Text.Encoding.UTF8.GetBytes(Json.Encode(new { provider = "typesafe", apiKey = TestKey })),
                System.Text.Encoding.UTF8.GetBytes("conversation-notes-windows-v1"), System.Security.Cryptography.DataProtectionScope.CurrentUser);
            File.WriteAllBytes(Path.Combine(legacyFolder, "config.dpapi"), legacyBytes);
            Check(Json.Encode(legacy.Status()).Contains("jev-1.13.0"), "legacy encrypted configuration remains readable");
            Check(Convert.ToBase64String(File.ReadAllBytes(Path.Combine(legacyFolder, "config.dpapi"))) == Convert.ToBase64String(legacyBytes), "reading legacy status never rewrites the encrypted file");
            legacy.Configure(Input("deepseek", deepKey)); legacy.Configure(Input("typesafe", ""));
            Check(Json.Text(legacy.Read(), "apiKey") == TestKey, "legacy key migrated without re-entry and retained after switching");
            Reject(() => store.Configure(Input("openrouter", "")), 400, "provider switch needs its own key");
            foreach (string key in new[] { "Bearer abc", "JEV_API_KEY=abc", "your_key", "xxx", "'abc'", "abc\nxyz", new string('a', 4097) })
                Reject(() => store.Configure(Input("typesafe", key)), 400, "invalid key rejected");
            Reject(() => store.Configure(Input("typesafe", "sk-or-not-real")), 400, "platform mismatch");
            Reject(() => store.Configure(Input("unknown", TestKey)), 400, "unknown provider");
            string fixture = Path.Combine(folder, "fixture.env");
            File.WriteAllText(fixture, "# fixture contains only a synthetic key\nJEV_PROVIDER=typesafe\nJEV_API_KEY=\"" + TestKey + "\" # comment\n");
            string original = File.ReadAllText(fixture);
            store.Import(fixture);
            Check(File.ReadAllText(fixture) == original && Json.Text(store.Read(), "apiKey") == TestKey, "env import preserves source");
            File.WriteAllBytes(Path.Combine(folder, "config.dpapi"), new byte[] { 1, 2, 3 });
            Reject(() => store.Read(), 503, "corrupt config is not silently discarded");
            store.Configure(Input("typesafe", TestKey));
            Check(Json.Text(store.Read(), "apiKey") == TestKey, "explicit replacement repairs config");
            foreach (string provider in new[] { "typesafe", "vercel", "openrouter" })
                Check(ModelClient.Endpoint(provider).StartsWith("https://"), "fixed HTTPS endpoint");
            FakeHttp handler = new FakeHttp();
            handler.Run = async (request, token) => {
                Check(request.RequestUri.AbsoluteUri == ModelClient.Endpoint("typesafe"), "native endpoint");
                Check(request.Headers.Authorization.Scheme == "Bearer" && request.Headers.Authorization.Parameter == TestKey, "native authorization");
                Check((await request.Content.ReadAsStringAsync()).Contains(ConfigStore.Model("typesafe")), "native model");
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"model\":\"offline-test\",\"answers\":{},\"usage\":{\"input_tokens\":0,\"output_tokens\":0}}") };
            };
            using (ModelClient client = new ModelClient(store, new HttpClient(handler)))
            {
                Check(Json.Encode(await client.Evaluate(Payload(), CancellationToken.None)).Contains("offline-test"), "offline native transport");
                Check(Json.Encode(await client.Evaluate(StructuredPayload(), CancellationToken.None)).Contains("offline-test"), "actual WebView structured analysis payload accepted");
                foreach (string provider in new[] { "typesafe", "vercel", "openrouter" })
                {
                    store.Configure(Input(provider, TestKey));
                    Dictionary<string, object> structured = StructuredPayload();
                    handler.Run = async (request, token) => {
                        Dictionary<string, object> sent = Json.Decode(await request.Content.ReadAsStringAsync());
                        Check(request.RequestUri.AbsoluteUri == ModelClient.Endpoint(provider), "structured request provider endpoint");
                        Check(Json.Text(sent, "model") == ConfigStore.Model(provider), "structured request provider model");
                        Check(sent["state"] is Dictionary<string, object>, "state remains a JSON object, not a string");
                        Check(Json.Encode(sent["state"]) == Json.Encode(structured["state"]), "all structured context fields preserved");
                        Check(Json.Encode(sent["questions"]) == Json.Encode(structured["questions"]), "structured instructions preserved");
                        return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"model\":\"offline-test\",\"answers\":{},\"usage\":{\"input_tokens\":0,\"output_tokens\":0}}") };
                    };
                    Check(Json.Encode(await client.Evaluate(structured, CancellationToken.None)).Contains("offline-test"), "structured analysis succeeds for provider");
                }
                store.Configure(Input("typesafe", TestKey));
                Dictionary<string, object> weightQuestions = Json.Decode("{\"quality\":{\"type\":\"score\",\"instructions\":\"Rate quality\",\"criteria\":[\"low\",\"mid\",\"high\"]}}");
                Dictionary<string, object> weightRequest = Json.Decode(Json.Encode(ModelClient.DeepseekRequest(StructuredPayload()["state"], weightQuestions, "deepseek-flash")));
                System.Collections.IList weightMessages = weightRequest["messages"] as System.Collections.IList;
                Dictionary<string, object> weightContext = Json.Decode(Json.Text(weightMessages[1] as Dictionary<string, object>, "content"));
                Check(Json.Encode(weightContext["answer_example"]) == "{\"answers\":{\"quality\":{\"weights\":{\"0\":50,\"2\":50}}}}", "DeepSeek score example includes every candidate weight");
                Dictionary<string, object> longOptions = new Dictionary<string, object>();
                for (int i = 0; i <= 100; i++) longOptions[i.ToString(System.Globalization.CultureInfo.InvariantCulture)] = null;
                weightQuestions["evidence"] = new { type = "choice", instructions = "Select evidence", criteria = longOptions };
                weightRequest = Json.Decode(Json.Encode(ModelClient.DeepseekRequest(StructuredPayload()["state"], weightQuestions, "deepseek-flash")));
                weightMessages = weightRequest["messages"] as System.Collections.IList;
                weightContext = Json.Decode(Json.Text(weightMessages[1] as Dictionary<string, object>, "content"));
                Dictionary<string, object> keysByQuestion = weightContext["answer_keys"] as Dictionary<string, object>;
                Check((keysByQuestion["evidence"] as System.Collections.IList).Count == 101, "DeepSeek retains every allowed candidate key");
                Dictionary<string, object> exampleAnswers = (weightContext["answer_example"] as Dictionary<string, object>)["answers"] as Dictionary<string, object>;
                Dictionary<string, object> exampleWeights = (exampleAnswers["evidence"] as Dictionary<string, object>)["weights"] as Dictionary<string, object>;
                Check(exampleWeights.Count == 2 && Convert.ToDouble(exampleWeights["0"]) == 50 && Convert.ToDouble(exampleWeights["99"]) == 50, "DeepSeek long candidate example includes explicit zero weights");
                foreach (string deepModel in new[] { "deepseek-flash", "deepseek-v4-pro" })
                {
                    store.Configure(new Dictionary<string, object> { { "provider", "deepseek" }, { "apiKey", deepKey }, { "model", deepModel } });
                    handler.Run = async (request, token) => {
                        Dictionary<string, object> sent = Json.Decode(await request.Content.ReadAsStringAsync());
                        Check(request.RequestUri.AbsoluteUri == "https://api.deepseek.com/chat/completions", "DeepSeek fixed strict endpoint");
                        Check(request.Headers.Authorization.Parameter == deepKey && Json.Text(sent, "model") == deepModel, "DeepSeek uses selected model and its own key");
                        System.Collections.IList messages = sent["messages"] as System.Collections.IList;
                        Dictionary<string, object> user = messages[1] as Dictionary<string, object>;
                        Dictionary<string, object> context = Json.Decode(Json.Text(user, "content"));
                        Check(Json.Encode(context["state"]) == Json.Encode(StructuredPayload()["state"]), "DeepSeek preserves original structured state");
                        Check(context["answer_keys"] is Dictionary<string, object> && context["answer_example"] is Dictionary<string, object>, "DeepSeek supplies an explicit answer format");
                        Check(!sent.ContainsKey("tools") && Json.Text(sent["response_format"] as Dictionary<string, object>, "type") == "json_object", "DeepSeek uses JSON mode");
                        return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Json.Encode(new {
                            model = deepModel, choices = new[] { new { finish_reason = "tool_calls", message = new { content = (string)null,
                                tool_calls = new[] { new { id = "synthetic-call", type = "function", function = new { name = "submit_analysis", arguments = "{\"answers\":{\"a\":0.8}}" } } }, reasoning_content = "discard private reasoning" } } },
                            usage = new { prompt_tokens = 20, completion_tokens = 10 } })) };
                    };
                    string result = Json.Encode(await client.Evaluate(StructuredPayload(), CancellationToken.None));
                    Check(result.Contains("answers") && result.Contains("input_tokens") && !result.Contains("reasoning"), "DeepSeek adapts to existing answer contract");
                    Check(Json.Text(Json.Decode(result), "format") == "deepseek-weights-v4", "DeepSeek uses the shared fixed weight decoder");
                }
                store.Configure(Input("typesafe", ""));
                store.Configure(Input("deepseek", ""));
                Dictionary<string, object> repairPayload = StructuredPayload(); repairPayload["deepseekRepair"] = true;
                handler.Run = async (request, token) => {
                    Dictionary<string, object> sent = Json.Decode(await request.Content.ReadAsStringAsync());
                    Check(!sent.ContainsKey("tools") && Json.Text(sent["response_format"] as Dictionary<string, object>, "type") == "json_object", "targeted repair uses JSON mode without tool parsing ambiguity");
                    return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Json.Encode(new {
                        model = "deepseek-v4-pro", choices = new[] { new { finish_reason = "stop", message = new { content = "{\"answers\":{\"a\":0.8}}" } } }, usage = new { prompt_tokens = 5, completion_tokens = 3 }
                    })) };
                };
                Check(Json.Text(Json.Decode(Json.Encode(await client.Evaluate(repairPayload, CancellationToken.None))), "format") == "deepseek-weights-v4", "JSON repair returns the same shared fixed-weight contract");
                Dictionary<string, object> malformedDeepseek = Json.Decode("{\"model\":\"deepseek-v4-pro\",\"choices\":[{\"finish_reason\":\"stop\",\"message\":{\"content\":\"{\\\"answers\\\":{}}}\"}}],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":3}}");
                Check(Json.Text(Json.Decode(Json.Encode(ModelClient.DeepseekResult(malformedDeepseek))), "json") == "{\"answers\":{}}}", "raw numeric JSON is passed to shared validation without platform-specific parsing");
                handler.Run = (request, token) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"model\":\"deepseek-flash\",\"choices\":[{\"finish_reason\":\"length\",\"message\":{\"content\":\"{\\\"answers\\\":{}}\"}}],\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":1}}") });
                try { await client.Evaluate(Payload(), CancellationToken.None); throw new Exception("Expected truncated DeepSeek rejection"); }
                catch (ApiException error) { Check(error.Status == 502, "truncated DeepSeek output rejected instead of saved as success"); }
                store.Configure(Input("typesafe", ""));
                int invalidCalls = 0;
                handler.Run = (request, token) => { invalidCalls++; return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)); };
                foreach (object invalidState in new object[] { null, "", "   ", 123, true, new object[0], new Dictionary<string, object>() })
                {
                    Dictionary<string, object> invalid = Payload();
                    invalid["state"] = invalidState;
                    Reject(() => client.Evaluate(invalid, CancellationToken.None).GetAwaiter().GetResult(), 400, "invalid state rejected locally");
                }
                Check(invalidCalls == 0, "invalid requests never reach transport");
                handler.Run = (request, token) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Unauthorized) { Content = new StringContent(TestKey) });
                try { await client.Evaluate(Payload(), CancellationToken.None); throw new Exception("Expected 401"); }
                catch (ApiException error) { Check(error.Status == 401 && !error.Message.Contains(TestKey), "provider errors do not leak bodies"); }
                handler.Run = (request, token) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Redirect));
                try { await client.Evaluate(Payload(), CancellationToken.None); throw new Exception("Expected redirect rejection"); }
                catch (ApiException error) { Check(error.Status == 502, "redirect not accepted"); }
                int attempts = 0;
                handler.Run = (request, token) => {
                    attempts++;
                    HttpResponseMessage response = new HttpResponseMessage(attempts == 1 ? HttpStatusCode.ServiceUnavailable : HttpStatusCode.OK) { Content = new StringContent("{\"model\":\"retry-test\"}") };
                    response.Headers.RetryAfter = new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.Zero);
                    return Task.FromResult(response);
                };
                await client.Evaluate(Payload(), CancellationToken.None);
                Check(attempts == 2, "single bounded retry");
                handler.Run = (request, token) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("not json") });
                try { await client.Evaluate(Payload(), CancellationToken.None); throw new Exception("Expected invalid JSON"); }
                catch (ApiException error) { Check(error.Status == 502, "invalid JSON rejected"); }
                handler.Run = async (request, token) => { await Task.Delay(10000, token); return new HttpResponseMessage(HttpStatusCode.OK); };
                using (CancellationTokenSource cancel = new CancellationTokenSource(30))
                {
                    try { await client.Evaluate(Payload(), cancel.Token); throw new Exception("Expected cancellation"); }
                    catch (OperationCanceledException) { Check(true, "cancellation reaches native transport"); }
                }
            }
            string opened = null;
            ReleaseClient.Open(value => opened = value);
            Check(opened == ReleaseClient.Page, "Release opener is fixed, independent of provider allowlist");
            ReleaseClient.OpenQuark(value => opened = value);
            Check(opened == "https://pan.quark.cn/s/7894e2647abc?pwd=LQxA", "Quark opens only the fixed public resource folder");
            int releaseCalls = 0;
            FakeHttp releaseHttp = new FakeHttp();
            releaseHttp.Run = async (request, token) => {
                releaseCalls++;
                Check(request.Method == HttpMethod.Get && request.RequestUri.AbsoluteUri == ReleaseClient.Endpoint, "fixed release GET endpoint");
                Check(request.Headers.Authorization == null && request.Content == null && !request.Headers.Contains("Cookie"), "release request has no key, body or cookies");
                Check(request.Headers.UserAgent.ToString() == "ConversationNotes-UpdateCheck", "static public update user agent");
                await Task.Delay(10, token);
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"tag_name\":\"v1.1.0\"}") };
            };
            using (ReleaseClient releases = new ReleaseClient(new HttpClient(releaseHttp)))
            {
                object[] results = await Task.WhenAll(releases.Check(CancellationToken.None), releases.Check(CancellationToken.None));
                Check(releaseCalls == 1 && Json.Text((Dictionary<string, object>)results[0], "tag_name") == "v1.1.0", "parallel release checks share successful cache");
                await releases.Check(CancellationToken.None);
                Check(releaseCalls == 1, "release cache protects GitHub rate limit");
                await releases.Check(CancellationToken.None, true);
                Check(releaseCalls == 2, "manual check bypasses settled release cache");
            }
            foreach (HttpResponseMessage response in new[] {
                new HttpResponseMessage(HttpStatusCode.Forbidden) { Content = new StringContent(TestKey) },
                new HttpResponseMessage(HttpStatusCode.Redirect),
                new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("not JSON") },
                new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(new string('x', 131073)) }
            })
            {
                int attempts = 0;
                releaseHttp = new FakeHttp();
                releaseHttp.Run = (request, token) => { attempts++; return Task.FromResult(response); };
                using (ReleaseClient releases = new ReleaseClient(new HttpClient(releaseHttp)))
                {
                    for (int n = 0; n < 2; n++)
                    {
                        try { await releases.Check(CancellationToken.None); throw new Exception("Expected update failure"); }
                        catch (ApiException error) { Check(error.Status == 502 && !error.Message.Contains(TestKey), "safe update failure"); }
                    }
                    Check(attempts == 1, "failed release checks also have cooldown");
                }
            }
            releaseHttp = new FakeHttp();
            releaseHttp.Run = async (request, token) => { await Task.Delay(10000, token); return new HttpResponseMessage(HttpStatusCode.OK); };
            using (ReleaseClient releases = new ReleaseClient(new HttpClient(releaseHttp)))
            using (CancellationTokenSource cancel = new CancellationTokenSource(30))
            {
                try { await releases.Check(cancel.Token); throw new Exception("Expected release cancellation"); }
                catch (OperationCanceledException) { Check(true, "release cancellation reaches native HTTP"); }
            }
            Console.WriteLine("Desktop offline checks passed: " + checks);
        }
        private static int Main(string[] args)
        {
            try { Run(args[0]).GetAwaiter().GetResult(); return 0; }
            catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
        }
    }
}
