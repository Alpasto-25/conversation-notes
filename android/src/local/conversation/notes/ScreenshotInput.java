package local.conversation.notes;

import java.util.Base64;

// Both Android vision routes accept only the renderer's bounded JPEG data.
final class ScreenshotInput {
    static String provider(String value) {
        if (value.isEmpty()) return "openrouter";
        if (!value.equals("openrouter") && !value.equals("deepseek")) throw new IllegalArgumentException("截图识别只支持 OpenAI 或 DeepSeek。");
        return value;
    }
    static String model(String provider) { return provider.equals("deepseek") ? "deepseek-flash" : "openai/gpt-6-luna"; }
    static String endpoint(String provider) { return provider.equals("deepseek") ? "https://api.deepseek.com/chat/completions" : "https://openrouter.ai/api/v1/chat/completions"; }
    static void validate(String image, String side) {
        if (!side.equals("left") && !side.equals("right")) throw new IllegalArgumentException("请选择自己的聊天气泡位置。");
        String prefix = "data:image/jpeg;base64,";
        if (image.length() > 1400000 || !image.startsWith(prefix)) throw new IllegalArgumentException("截图格式或大小不符合要求。");
        try {
            byte[] data = Base64.getDecoder().decode(image.substring(prefix.length()));
            if (data.length < 4 || data.length > 1048576 || (data[0] & 255) != 255 || (data[1] & 255) != 216 || (data[2] & 255) != 255) throw new IllegalArgumentException();
        } catch (IllegalArgumentException error) { throw new IllegalArgumentException("请选择有效的聊天截图。"); }
    }
}
