package local.conversation.notes;
import java.io.File;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Base64;
public class BackupTransferTests {
    static int checks;
    static void check(boolean value) { if(!value) throw new AssertionError("Backup transfer failed"); checks++; }
    interface Attempt { void run() throws Exception; }
    static void rejected(Attempt attempt) throws Exception { try { attempt.run(); } catch(Exception expected) { checks++; return; } throw new AssertionError("Expected rejection"); }
    public static void main(String[] args) throws Exception {
        File cache=Files.createTempDirectory("notes-backup-test-").toFile();
        try(BackupTransfer transfer=new BackupTransfer()) {
            rejected(() -> transfer.begin(cache,"../private.json",10));
            rejected(() -> transfer.begin(cache,"conversation-notes-backup-20261021-120000.json.exe",10));
            rejected(() -> transfer.begin(cache,"conversation-notes-backup-20261021-120000.json",64L*1024*1024+1));
            byte[] original=new byte[1800000]; for(int i=0;i<original.length;i++) original[i]=(byte)(i%251);
            String token=transfer.begin(cache,"conversation-notes-backup-20261021-120000.json",original.length);
            rejected(() -> transfer.finish(token));
            rejected(() -> transfer.chunk(token,1,"YQ=="));
            rejected(() -> transfer.chunk("foreign",0,"YQ=="));
            for(int offset=0,index=0;offset<original.length;offset+=196608,index++) transfer.chunk(token,index,Base64.getEncoder().encodeToString(Arrays.copyOfRange(original,offset,Math.min(original.length,offset+196608))));
            File result=transfer.finish(token); check(Arrays.equals(original,Files.readAllBytes(result.toPath()))); Files.delete(result.toPath());
            String cancelled=transfer.begin(cache,"conversation-notes-report-20261021-120000.md",1); transfer.cancel(cancelled);
            rejected(() -> transfer.chunk(cancelled,0,"YQ=="));
            String zip=transfer.begin(cache,"conversation-notes-images-20261021-120000.zip",1); transfer.cancel(zip);
            check(cache.list().length==0);
        } finally { Files.delete(cache.toPath()); }
        System.out.println("Android backup transfer: "+checks+" checks passed (offline).");
    }
}
