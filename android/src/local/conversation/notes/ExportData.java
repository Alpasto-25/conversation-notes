package local.conversation.notes;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.zip.CRC32;

final class ExportData {
    final String action, format, name;
    final byte[] bytes;
    private ExportData(String action, String format, String name, byte[] bytes) { this.action=action; this.format=format; this.name=name; this.bytes=bytes; }
    static ExportData decode(String action, String format, String name, String data) throws Exception {
        if ((!action.equals("save") && !action.equals("share")) || (!format.equals("png") && !format.equals("txt"))
            || !name.matches("conversation-notes-[0-9]{8}-[0-9]{6}(-p[0-9]{1,5})?\\."+format)
            || data.isEmpty() || data.length()>1866668 || !data.matches("[A-Za-z0-9+/]+={0,2}")) throw new Exception("Invalid export");
        byte[] bytes = Base64.getDecoder().decode(data);
        if (bytes.length==0 || bytes.length>1400000) throw new Exception("Invalid size");
        if (format.equals("txt")) StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes));
        else {
            byte[] signature = {(byte)137,80,78,71,13,10,26,10};
            if (bytes.length<45) throw new Exception("Invalid PNG");
            for (int i=0;i<8;i++) if (bytes[i]!=signature[i]) throw new Exception("Invalid PNG");
            ByteBuffer buffer = ByteBuffer.wrap(bytes);
            if (buffer.getInt(8)!=13 || buffer.getInt(12)!=0x49484452 || buffer.getInt(16)!=1080 || buffer.getInt(20)<640 || buffer.getInt(20)>2600) throw new Exception("Invalid dimensions");
            int at=8; boolean ended=false, image=false;
            while (at<bytes.length) {
                if (bytes.length-at<12) throw new Exception("Invalid chunk");
                int size=buffer.getInt(at), kind=buffer.getInt(at+4);
                if (size<0 || size>bytes.length-at-12) throw new Exception("Invalid chunk");
                CRC32 crc=new CRC32(); crc.update(bytes,at+4,size+4);
                if ((int)crc.getValue()!=buffer.getInt(at+8+size)) throw new Exception("Invalid CRC");
                if (kind==0x49444154) image=true;
                at+=size+12;
                if (kind==0x49454e44) { ended=size==0 && at==bytes.length; break; }
            }
            if (!ended || !image) throw new Exception("Incomplete PNG");
        }
        return new ExportData(action,format,name,bytes);
    }
    String mime() { return format.equals("png") ? "image/png" : "text/plain"; }
    String text() { return new String(bytes, StandardCharsets.UTF_8); }
}
