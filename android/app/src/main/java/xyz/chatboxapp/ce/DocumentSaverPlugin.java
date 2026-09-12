package xyz.chatboxapp.ce;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Native implementation backing the web-side AndroidDocumentSaver
 * (src/renderer/platform/android_document_saver.ts). Copies a source URI
 * (usually a cache file written by the Capacitor Filesystem plugin) into the
 * public Downloads collection so the user can keep the exported file.
 */
@CapacitorPlugin(name = "DocumentSaver")
public class DocumentSaverPlugin extends Plugin {

    @PluginMethod
    public void saveFile(PluginCall call) {
        String sourceUri = call.getString("sourceUri");
        String suggestedName = call.getString("suggestedName");
        String mimeType = call.getString("mimeType");
        if (sourceUri == null || sourceUri.isEmpty() || suggestedName == null || suggestedName.isEmpty()) {
            call.reject("sourceUri and suggestedName are required");
            return;
        }

        try {
            Context context = getContext().getContext();
            ContentResolver resolver = context.getContentResolver();
            InputStream in = resolver.openInputStream(Uri.parse(sourceUri));
            if (in == null) {
                call.reject("Cannot open source file: " + sourceUri);
                return;
            }

            Uri target = insertTarget(context, resolver, suggestedName, mimeType);
            if (target == null) {
                in.close();
                call.reject("Cannot create download entry for " + suggestedName);
                return;
            }

            OutputStream out = resolver.openOutputStream(target);
            if (out == null) {
                in.close();
                call.reject("Cannot open output stream for " + target);
                return;
            }
            copy(in, out);
            out.flush();
            out.close();
            in.close();

            JSObject result = new JSObject();
            result.put("uri", target.toString());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to save file: " + e.getMessage(), e);
        }
    }

    private Uri insertTarget(Context context, ContentResolver resolver, String name, String mimeType)
            throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            if (mimeType != null && !mimeType.isEmpty()) {
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            }
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri target = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (target != null) {
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(target, values, null, null);
            }
            return target;
        }

        // Legacy path for Android 9 and below.
        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!downloads.exists() && !downloads.mkdirs()) {
            return null;
        }
        File targetFile = new File(downloads, uniqueName(downloads, name));
        if (mimeType != null && !mimeType.isEmpty()) {
            // Best effort: write without MIME metadata; the file itself is still usable.
            targetFile.setReadable(true);
        }
        return Uri.fromFile(targetFile);
    }

    private String uniqueName(File dir, String name) {
        File candidate = new File(dir, name);
        if (!candidate.exists()) {
            return name;
        }
        String base = name;
        String extension = "";
        int dot = name.lastIndexOf('.');
        if (dot > 0) {
            base = name.substring(0, dot);
            extension = name.substring(dot);
        }
        int index = 1;
        while (candidate.exists()) {
            candidate = new File(dir, base + " (" + index + ")" + extension);
            index++;
        }
        return candidate.getName();
    }

    private void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buffer = new byte[8192];
        int read;
        while ((read = in.read(buffer)) > 0) {
            out.write(buffer, 0, read);
        }
    }
}
