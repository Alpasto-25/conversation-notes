package local.conversation.notes;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.util.UUID;

public final class ShareFiles extends ContentProvider {
    private static final String AUTHORITY="local.conversation.notes.share";
    static synchronized Uri create(Context context, ExportData data) throws Exception {
        File directory=new File(context.getCacheDir(),"shared-notes");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new Exception("Export cache unavailable");
        File[] old=directory.listFiles();
        if (old!=null) for (File file:old) if (file.lastModified()<System.currentTimeMillis()-86400000L) file.delete();
        File file=new File(directory,UUID.randomUUID().toString()+"."+data.format);
        try (FileOutputStream stream=new FileOutputStream(file)) { stream.write(data.bytes); }
        return new Uri.Builder().scheme("content").authority(AUTHORITY).appendPath(file.getName()).build();
    }
    private File file(Uri uri) throws FileNotFoundException {
        if (!"content".equals(uri.getScheme()) || !AUTHORITY.equals(uri.getAuthority()) || uri.getQuery()!=null || uri.getFragment()!=null
            || uri.getPathSegments().size()!=1 || !uri.getLastPathSegment().matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}\\.(png|txt)")) throw new FileNotFoundException();
        File file=new File(new File(getContext().getCacheDir(),"shared-notes"),uri.getLastPathSegment());
        if (!file.isFile()) throw new FileNotFoundException();
        return file;
    }
    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) { return uri.getPath()!=null && uri.getPath().endsWith(".png") ? "image/png" : "text/plain"; }
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort) {
        try {
            File file=file(uri); String[] columns=projection==null ? new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;
            MatrixCursor cursor=new MatrixCursor(columns); Object[] values=new Object[columns.length];
            for (int i=0;i<columns.length;i++) values[i]=columns[i].equals(OpenableColumns.DISPLAY_NAME) ? "conversation-notes."+(file.getName().endsWith(".png")?"png":"txt") : columns[i].equals(OpenableColumns.SIZE) ? file.length() : null;
            cursor.addRow(values); return cursor;
        } catch (FileNotFoundException ignored) { return null; }
    }
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException();
        return ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Uri insert(Uri uri,ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri,String selection,String[] args) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri,ContentValues values,String selection,String[] args) { throw new UnsupportedOperationException(); }
}
