package local.conversation.notes;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.spec.MGF1ParameterSpec;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;
import javax.crypto.spec.SecretKeySpec;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String MASTER_KEY = "conversation-notes-config-v1";
    private static final String IMPORT_KEY = "conversation-notes-usb-v1";
    private static final int FILE_PICKER = 410;
    private WebView web;
    private SharedPreferences prefs;
    private ValueCallback<Uri[]> fileCallback;
    private final ExecutorService workers = Executors.newFixedThreadPool(4);
    private final Set<String> jobs = ConcurrentHashMap.newKeySet();
    private final Set<String> cancelled = ConcurrentHashMap.newKeySet();
    private final Map<String, HttpURLConnection> connections = new ConcurrentHashMap<>();
    private volatile ServerSocket provisionSocket;
    private volatile boolean destroyed;
    private long minuteAt = 0, hourAt = 0;
    private int minuteCalls = 0, hourCalls = 0;

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        prefs = getSharedPreferences("secure-config", MODE_PRIVATE);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(246, 245, 244));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(246, 245, 244));
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return insets;
            });
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) controller.setSystemBarsAppearance(
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        } else root.setFitsSystemWindows(true);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Only user-chosen document URIs.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBlockNetworkLoads(true); // All HTTPS model traffic is native.
        settings.setSupportMultipleWindows(false);
        web.addJavascriptInterface(new Bridge(), "DialogueNative");
        boolean debug = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debug);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isPackaged(request.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!isPackaged(uri)) return response(403, "text/plain", "External content is disabled");
                String path = uri.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                if (path.contains("..") || path.contains("\\")) return response(403, "text/plain", "Invalid path");
                String mime = path.endsWith(".js") ? "application/javascript" : path.endsWith(".css") ? "text/css"
                    : path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".html") ? "text/html" : "application/octet-stream";
                try {
                    Map<String, String> headers = new HashMap<>();
                    headers.put("X-Content-Type-Options", "nosniff");
                    headers.put("Cache-Control", "no-cache");
                    headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, getAssets().open("www" + path));
                } catch (Exception ignored) { return response(404, "text/plain", "Asset not found"); }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try { startActivityForResult(intent, FILE_PICKER); }
                catch (Exception ignored) { fileCallback.onReceiveValue(null); fileCallback = null; }
                return true;
            }
        });
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, this::handleBack);
        web.loadUrl(ORIGIN + "/index.html");
        if (debug) startUsbProvisioning();
    }

    private boolean isPackaged(Uri uri) {
        return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443);
    }
    private WebResourceResponse response(int status, String mime, String text) {
        return new WebResourceResponse(mime, "UTF-8", status, status == 404 ? "Not Found" : "Forbidden", null,
            new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8)));
    }
    private void handleBack() {
        web.evaluateJavascript("Boolean(window.__notebookBack && window.__notebookBack())", handled -> {
            if (!"true".equals(handled)) finish();
        });
    }
    @Override public void onBackPressed() { handleBack(); }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == FILE_PICKER && fileCallback != null) {
            Uri chosen = result == RESULT_OK && data != null ? data.getData() : null;
            fileCallback.onReceiveValue(chosen != null && "content".equals(chosen.getScheme()) ? new Uri[]{chosen} : null);
            fileCallback = null;
        }
    }
    @Override protected void onDestroy() {
        destroyed = true;
        try { if (provisionSocket != null) provisionSocket.close(); } catch (Exception ignored) {}
        for (HttpURLConnection connection : connections.values()) connection.disconnect();
        workers.shutdownNow();
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        web.removeJavascriptInterface("DialogueNative");
        web.destroy();
        super.onDestroy();
    }

    private KeyStore keyStore() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null); return store;
    }
    private SecretKey masterKey() throws Exception {
        KeyStore store = keyStore();
        if (!store.containsAlias(MASTER_KEY)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(MASTER_KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build());
            generator.generateKey();
        }
        return (SecretKey) keyStore().getKey(MASTER_KEY, null);
    }
    private synchronized JSONObject readConfig() throws Exception {
        String stored = prefs.getString("encrypted", "");
        if (stored.isEmpty()) return new JSONObject();
        JSONObject encrypted = new JSONObject(stored);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, masterKey(), new GCMParameterSpec(128, decode(encrypted.getString("iv"))));
        return new JSONObject(new String(cipher.doFinal(decode(encrypted.getString("data"))), StandardCharsets.UTF_8));
    }
    private synchronized JSONObject configure(JSONObject input) throws Exception {
        String provider = input.optString("provider", "typesafe");
        if (!provider.equals("typesafe") && !provider.equals("vercel") && !provider.equals("openrouter"))
            throw new ApiException(400, "平台只支持 TypeSafe、Vercel 和 OpenRouter。");
        String key = input.optString("apiKey", "").trim();
        if (key.isEmpty()) {
            JSONObject old = readConfig();
            if (provider.equals(old.optString("provider"))) key = old.optString("apiKey");
        }
        if (key.isEmpty()) throw new ApiException(400, "请先粘贴这个平台的 API Key。");
        if (key.length() > 4096 || key.matches("(?i)^(your[_-].*|replace[_-].*|xxx+|<.*>)$")
            || key.matches("(?s).*[\\s\\x00-\\x1f\\x7f\"'`=].*"))
            throw new ApiException(400, "只粘贴 Key 本身，不要带变量名、引号或 Bearer。");
        if (key.startsWith("sk-or-") && !provider.equals("openrouter"))
            throw new ApiException(400, "这看起来是 OpenRouter Key，请选择 OpenRouter。");
        JSONObject config = new JSONObject().put("provider", provider).put("apiKey", key);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, masterKey());
        byte[] ciphertext = cipher.doFinal(config.toString().getBytes(StandardCharsets.UTF_8));
        JSONObject encrypted = new JSONObject().put("iv", encode(cipher.getIV())).put("data", encode(ciphertext));
        if (!prefs.edit().putString("encrypted", encrypted.toString()).commit())
            throw new ApiException(500, "手机存储写入失败，请检查空间后重试。");
        return status();
    }
    private JSONObject status() throws Exception {
        JSONObject config = readConfig();
        String provider = config.optString("provider", "typesafe");
        return new JSONObject().put("configured", !config.optString("apiKey").isEmpty())
            .put("provider", provider).put("model", model(provider));
    }
    private String model(String provider) {
        return provider.equals("openrouter") ? "typesafe/jev-1.13" : provider.equals("vercel") ? "typesafe-ai/jev" : "jev-1.13.0";
    }
    private String endpoint(String provider) throws ApiException {
        if (provider.equals("typesafe")) return "https://api.typesafe.ai/v1/systemone";
        if (provider.equals("vercel")) return "https://ai-gateway.vercel.sh/typesafe/v1/systemone";
        if (provider.equals("openrouter")) return "https://openrouter.ai/api/alpha/decisions";
        throw new ApiException(400, "服务平台不受支持，请重新保存配置。");
    }
    private synchronized void takeBudget() throws ApiException {
        long now = System.currentTimeMillis();
        if (now - minuteAt > 60000) { minuteAt = now; minuteCalls = 0; }
        if (now - hourAt > 3600000) { hourAt = now; hourCalls = 0; }
        if (minuteCalls >= 180 || hourCalls >= 3000) throw new ApiException(429, "请求较多，进度已保留，请稍后继续。");
        minuteCalls++; hourCalls++;
    }
    private JSONObject evaluate(String id, JSONObject payload) throws Exception {
        takeBudget();
        JSONObject config = readConfig();
        String key = config.optString("apiKey");
        if (key.isEmpty()) throw new ApiException(503, "请先在右上角设置中填写 API Key。");
        String provider = config.optString("provider", "typesafe");
        payload.put("model", model(provider));
        byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
        if (body.length > 2000000) throw new ApiException(413, "聊天过长，请缩小范围。");
        for (int attempt = 0; attempt < 2; attempt++) {
            if (cancelled.contains(id) || Thread.currentThread().isInterrupted()) throw new ApiException(499, "已停止分析。");
            HttpURLConnection connection = (HttpURLConnection) new URL(endpoint(provider)).openConnection();
            connections.put(id, connection);
            try {
                connection.setInstanceFollowRedirects(false);
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
                connection.setRequestProperty("Authorization", "Bearer " + key);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setFixedLengthStreamingMode(body.length);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(body); }
                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) {
                    // Never show/log provider bodies, which can echo keys or chat.
                    String retryHeader = connection.getHeaderField("Retry-After");
                    double seconds = 0.4;
                    try { if (retryHeader != null) seconds = Double.parseDouble(retryHeader); }
                    catch (NumberFormatException ignored) { seconds = 10; }
                    if (attempt == 0 && (code == 429 || code == 503 || code == 529) && seconds >= 0 && seconds <= 3) {
                        connection.disconnect(); Thread.sleep(Math.max(100, (long)(seconds * 1000))); continue;
                    }
                    throw new ApiException(code >= 400 && code < 600 ? code : 502, httpMessage(code, provider));
                }
                try (InputStream input = connection.getInputStream()) {
                    return new JSONObject(new String(readLimited(input, 4000000, false), StandardCharsets.UTF_8));
                }
            } finally { connections.remove(id); connection.disconnect(); }
        }
        throw new ApiException(502, "模型服务暂不可用，请稍后重试。");
    }
    private String httpMessage(int code, String provider) {
        String name = provider.equals("typesafe") ? "TypeSafe" : provider.equals("vercel") ? "Vercel AI Gateway" : "OpenRouter";
        String reason;
        switch (code) {
            case 400: case 422: reason = "无法处理当前输入，请缩小聊天范围。"; break;
            case 401: reason = "API Key 无效或过期，请在设置中更换。"; break;
            case 402: reason = "额度不足，请在平台检查余额。"; break;
            case 403: reason = "没有调用权限，请检查 Key 权限及平台账号验证。"; break;
            case 404: reason = "模型或接口暂不可用。"; break;
            case 413: reason = "聊天过长，请缩小范围。"; break;
            case 429: reason = "请求受限，请稍后继续。"; break;
            default: reason = "服务暂不可用，请稍后重试。";
        }
        return name + "：" + reason;
    }
    private void deliver(String id, boolean ok, JSONObject value) {
        runOnUiThread(() -> {
            if (!destroyed) web.evaluateJavascript("window.__dialogueNativeResolve && window.__dialogueNativeResolve("
                + JSONObject.quote(id) + "," + ok + "," + value.toString() + ")", null);
        });
    }
    private final class Bridge {
        @JavascriptInterface public void call(String id, String method, String raw) {
            if (destroyed || id == null || !id.matches("[A-Za-z0-9-]{1,64}") || raw == null || raw.length() > 2000000) return;
            jobs.add(id);
            workers.execute(() -> {
                try {
                    if (cancelled.contains(id)) return;
                    JSONObject input = new JSONObject(raw), result;
                    if (method.equals("openExternal")) {
                        String url = input.optString("url");
                        Uri uri = Uri.parse(url);
                        boolean allowed = false;
                        if ("https".equals(uri.getScheme()) && uri.getUserInfo() == null && uri.getFragment() == null && uri.getPort() == -1) {
                            try (InputStream source = getAssets().open("official-links.json")) {
                                JSONArray links = new JSONArray(new String(readLimited(source, 32768, false), StandardCharsets.UTF_8));
                                for (int index = 0; index < links.length(); index++) if (url.equals(links.getString(index))) allowed = true;
                            }
                        }
                        if (!allowed) throw new ApiException(400, "只允许打开已核对的供应商官方入口。");
                        runOnUiThread(() -> {
                            if (destroyed) return;
                            try {
                                startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
                                deliver(id, true, new JSONObject().put("opened", true));
                            } catch (Exception ignored) {
                                try { deliver(id, false, new JSONObject().put("status", 502).put("error", "无法打开手机浏览器，请复制官方链接后自行访问。")); } catch (Exception ignoredAgain) {}
                            }
                        });
                        return;
                    }
                    if (method.equals("status")) result = status();
                    else if (method.equals("configure")) result = configure(input);
                    else if (method.equals("evaluate")) result = evaluate(id, input);
                    else throw new ApiException(400, "不支持的操作。");
                    if (!cancelled.contains(id)) deliver(id, true, result);
                } catch (Exception error) {
                    if (!cancelled.contains(id)) {
                        int code = error instanceof ApiException ? ((ApiException)error).status : error instanceof SocketTimeoutException ? 504 : 502;
                        String message = error instanceof ApiException ? error.getMessage() : networkMessage(error);
                        try { deliver(id, false, new JSONObject().put("status", code).put("error", message)); } catch (Exception ignored) {}
                    }
                } finally { jobs.remove(id); cancelled.remove(id); }
            });
        }
        @JavascriptInterface public void cancel(String id) {
            if (!jobs.contains(id)) return;
            cancelled.add(id);
            HttpURLConnection connection = connections.get(id);
            if (connection != null) connection.disconnect();
        }
    }

    private String networkMessage(Exception error) {
        // Exception class names are safe to expose; messages/stack traces can
        // contain request payloads and must never be shown or logged.
        if (error instanceof java.net.UnknownHostException) return "无法解析模型服务地址，请检查手机网络或 DNS。";
        if (error instanceof javax.net.ssl.SSLException) return "手机与模型服务的安全连接失败，请检查网络、系统时间或代理。";
        if (error instanceof SocketTimeoutException) return "手机连接模型服务超时，请检查网络后重试。";
        if (error instanceof java.net.ConnectException || error instanceof java.net.NoRouteToHostException)
            return "手机无法连接模型服务，请检查网络或代理。";
        if (error instanceof org.json.JSONException) return "模型服务返回格式异常，请稍后重试。";
        return "手机请求失败（" + error.getClass().getSimpleName() + "），请检查网络；必要时重新保存配置。";
    }

    // Debug deployment only: encrypted USB provisioning. No plaintext temp file,
    // clipboard, intent extra or APK asset ever contains the transferred key.
    private void startUsbProvisioning() {
        Thread thread = new Thread(() -> {
            try {
                KeyStore store = keyStore();
                boolean modern = Build.VERSION.SDK_INT >= 35;
                if (!store.containsAlias(IMPORT_KEY)) {
                    KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, "AndroidKeyStore");
                    KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(IMPORT_KEY, KeyProperties.PURPOSE_DECRYPT)
                        .setKeySize(2048).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP)
                        .setDigests(modern ? KeyProperties.DIGEST_SHA256 : KeyProperties.DIGEST_SHA1);
                    if (modern) spec.setMgf1Digests(KeyProperties.DIGEST_SHA256);
                    generator.initialize(spec.build()); generator.generateKeyPair();
                }
                provisionSocket = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
                JSONObject publicInfo = new JSONObject().put("port", provisionSocket.getLocalPort())
                    .put("oaepHash", modern ? "sha256" : "sha1")
                    .put("publicKey", encode(keyStore().getCertificate(IMPORT_KEY).getPublicKey().getEncoded()));
                try (FileOutputStream output = new FileOutputStream(new File(getFilesDir(), "provision-public.json"))) {
                    output.write(publicInfo.toString().getBytes(StandardCharsets.UTF_8));
                }
                while (!destroyed && !provisionSocket.isClosed()) {
                    try (Socket client = provisionSocket.accept()) {
                        client.setSoTimeout(15000);
                        try {
                            JSONObject envelope = new JSONObject(new String(readLimited(client.getInputStream(), 32768, true), StandardCharsets.UTF_8));
                            if (envelope.getInt("version") != 1) throw new Exception("Version");
                            Cipher rsa = Cipher.getInstance("RSA/ECB/OAEPPadding");
                            String digest = modern ? "SHA-256" : "SHA-1";
                            rsa.init(Cipher.DECRYPT_MODE, (PrivateKey) keyStore().getKey(IMPORT_KEY, null),
                                new OAEPParameterSpec(digest, "MGF1", modern ? MGF1ParameterSpec.SHA256 : MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT));
                            byte[] transferKey = rsa.doFinal(decode(envelope.getString("wrappedKey")));
                            Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
                            aes.init(Cipher.DECRYPT_MODE, new SecretKeySpec(transferKey, "AES"),
                                new GCMParameterSpec(128, decode(envelope.getString("iv"))));
                            JSONObject config = new JSONObject(new String(aes.doFinal(decode(envelope.getString("data"))), StandardCharsets.UTF_8));
                            configure(config);
                            java.util.Arrays.fill(transferKey, (byte)0);
                            client.getOutputStream().write("{\"ok\":true}\n".getBytes(StandardCharsets.UTF_8));
                            runOnUiThread(() -> {
                                if (!destroyed) {
                                    web.evaluateJavascript("window.dispatchEvent(new Event('notebook-config-changed'))", null);
                                    Toast.makeText(this, "API 配置已加密保存到手机", Toast.LENGTH_SHORT).show();
                                }
                            });
                            provisionSocket.close();
                        } catch (Exception ignored) {
                            client.getOutputStream().write("{\"ok\":false}\n".getBytes(StandardCharsets.UTF_8));
                        }
                    }
                }
            } catch (Exception ignored) { /* Manual in-app setup remains available. */ }
        }, "notebook-usb-provisioning");
        thread.setDaemon(true); thread.start();
    }
    private static byte[] readLimited(InputStream input, int maximum, boolean line) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[line ? 1 : 8192];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (line && buffer[0] == '\n') break;
            if (output.size() + count > maximum) throw new ApiException(413, "响应过大，请缩小范围。");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }
    private static String encode(byte[] value) { return Base64.encodeToString(value, Base64.NO_WRAP); }
    private static byte[] decode(String value) { return Base64.decode(value, Base64.NO_WRAP); }
    private static final class ApiException extends Exception {
        final int status;
        ApiException(int status, String message) { super(message); this.status = status; }
    }
}
