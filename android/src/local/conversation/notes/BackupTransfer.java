package local.conversation.notes;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Base64;
import java.util.UUID;

final class BackupTransfer implements AutoCloseable {
    private File file;
    private String token, name;
    private long expected, received;
    private int next;
    synchronized String begin(File cache, String filename, long size) throws Exception {
        close();
        if (!filename.matches("conversation-notes-(backup-[0-9]{8}-[0-9]{6}\\.json|report-[0-9]{8}-[0-9]{6}\\.md|images-[0-9]{8}-[0-9]{6}\\.zip)") || size<=0 || size>64L*1024*1024) throw new Exception("Invalid backup");
        file=File.createTempFile("notes-backup-", ".json", cache); name=filename;
        expected=size; received=0; next=0; token=UUID.randomUUID().toString(); return token;
    }
    private void check(String value) throws Exception { if(file==null || !token.equals(value)) throw new Exception("Invalid backup session"); }
    synchronized void chunk(String value, int index, String encoded) throws Exception {
        check(value);
        if(index!=next || encoded.length()>262144) throw new Exception("Invalid backup chunk");
        byte[] bytes=Base64.getDecoder().decode(encoded);
        if(bytes.length==0 || bytes.length>196608 || received+bytes.length>expected) throw new Exception("Invalid backup size");
        try(FileOutputStream output=new FileOutputStream(file,true)) { output.write(bytes); }
        received+=bytes.length; next++;
    }
    synchronized File finish(String value) throws Exception {
        check(value); if(received!=expected || file.length()!=expected) throw new Exception("Incomplete backup");
        File completed=file; file=null; return completed;
    }
    synchronized String name() { return name; }
    synchronized void cancel(String value) { if(value.equals(token)) close(); }
    public synchronized void close() { if(file!=null) file.delete(); file=null; token=null; }
}
