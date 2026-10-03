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
            Console.WriteLine("Desktop offline checks passed: " + checks);
        }
        private static int Main(string[] args)
        {
            try { Run(args[0]).GetAwaiter().GetResult(); return 0; }
            catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
        }
    }
}
