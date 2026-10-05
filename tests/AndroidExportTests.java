package local.conversation.notes;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.zip.CRC32;
import java.util.zip.DeflaterOutputStream;

public class AndroidExportTests {
    static int checks=0;
    static void check(boolean value) { if (!value) throw new AssertionError("Export test failed"); checks++; }
    static String encoded(byte[] data) { return Base64.getEncoder().encodeToString(data); }
    static void rejected(String action,String format,String name,String data) throws Exception {
        boolean rejected=false; try { ExportData.decode(action,format,name,data); } catch (Exception error) { rejected=true; } check(rejected);
    }
    static void chunk(DataOutputStream output,String type,byte[] bytes) throws Exception {
        byte[] key=type.getBytes(StandardCharsets.US_ASCII); CRC32 crc=new CRC32(); crc.update(key); crc.update(bytes);
        output.writeInt(bytes.length); output.write(key); output.write(bytes); output.writeInt((int)crc.getValue());
    }
    public static void main(String[] args) throws Exception {
        String name="conversation-notes-20261005-173000.txt", text="合成对话片段\n已有分析 👋", data=encoded(text.getBytes(StandardCharsets.UTF_8));
        ExportData txt=ExportData.decode("save","txt",name,data); check(txt.text().equals(text)); check(txt.mime().equals("text/plain"));
        check(ExportData.decode("share","txt",name,data).action.equals("share"));
        for (String invalid:new String[]{"../config", "C:\\private.txt", name+".exe", name.replace("txt","png")}) rejected("save","txt",invalid,data);
        for (String invalid:new String[]{"", "!invalid", "/w==", "A".repeat(1866672)}) rejected("save","txt",name,invalid);
        rejected("delete","txt",name,data); rejected("save","exe",name,data);
        ByteArrayOutputStream png=new ByteArrayOutputStream(); DataOutputStream output=new DataOutputStream(png);
        output.write(new byte[]{(byte)137,80,78,71,13,10,26,10});
        ByteArrayOutputStream header=new ByteArrayOutputStream(); DataOutputStream h=new DataOutputStream(header); h.writeInt(1080); h.writeInt(2600); h.write(new byte[]{8,6,0,0,0});
        chunk(output,"IHDR",header.toByteArray());
        ByteArrayOutputStream image=new ByteArrayOutputStream();
        try (DeflaterOutputStream z=new DeflaterOutputStream(image)) { for (int i=0;i<2600;i++) z.write(new byte[1080*4+1]); }
        chunk(output,"IDAT",image.toByteArray()); chunk(output,"IEND",new byte[0]);
        String pictureName=name.replace(".txt","-p1.png");
        check(ExportData.decode("share","png",pictureName,encoded(png.toByteArray())).mime().equals("image/png"));
        rejected("share","png",pictureName,data);
        byte[] corrupted=png.toByteArray(); corrupted[18]^=1; rejected("share","png",pictureName,encoded(corrupted));
        corrupted=png.toByteArray(); corrupted[corrupted.length-1]^=1; rejected("share","png",pictureName,encoded(corrupted));
        corrupted=java.util.Arrays.copyOf(png.toByteArray(),png.size()-12); rejected("share","png",pictureName,encoded(corrupted));
        System.out.println("Android export validation: "+checks+" checks passed (offline).");
    }
}
