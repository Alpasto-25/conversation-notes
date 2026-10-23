package local.conversation.notes;

public final class AndroidScreenshotTests {
    private static int checks;
    private static void check(boolean value) { if (!value) throw new AssertionError(); checks++; }
    private static void reject(String image, String side) {
        try { ScreenshotInput.validate(image, side); throw new AssertionError("Expected invalid screenshot"); }
        catch (IllegalArgumentException expected) { checks++; }
    }
    public static void main(String[] args) {
        String image = "data:image/jpeg;base64,/9j/2Q==";
        ScreenshotInput.validate(image, "left"); ScreenshotInput.validate(image, "right"); checks += 2;
        for (String bad : new String[] { "https://example.org/private.jpg", "data:image/png;base64,/9j/2Q==", "data:image/jpeg;base64,AAAA", "data:image/jpeg;base64,!?", "a".repeat(1400001) }) reject(bad, "right");
        reject(image, "unknown");
        check(ScreenshotInput.provider("").equals("openrouter"));
        check(ScreenshotInput.provider("deepseek").equals("deepseek"));
        for (String provider : new String[] { "typesafe", "vercel", "constructor", "https://invalid.example" }) {
            try { ScreenshotInput.provider(provider); throw new AssertionError(); }
            catch (IllegalArgumentException expected) { checks++; }
        }
        check(ScreenshotInput.model("deepseek").equals("deepseek-flash"));
        check(ScreenshotInput.model("openrouter").equals("openai/gpt-6-luna"));
        check(ScreenshotInput.endpoint("deepseek").equals("https://api.deepseek.com/chat/completions"));
        check(ScreenshotInput.endpoint("openrouter").equals("https://openrouter.ai/api/v1/chat/completions"));
        System.out.println("Android screenshot checks passed: " + checks);
    }
}
