#!/usr/bin/env bash
# SpendRecorder Android native Downloads plugin, generated in the Android build only.
# Based on Fairpot's Fire HD 8 MediaStore/legacy Downloads implementation.
set -euo pipefail
DIR="android/app/src/main/java/io/github/willyros01/spendrecorder"
mkdir -p "$DIR"
cat > "$DIR/MainActivity.java" <<'JAVA'
package io.github.willyros01.spendrecorder;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle savedInstanceState) {
    registerPlugin(SpendRecorderDocumentPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
JAVA
cat > "$DIR/SpendRecorderDocumentPlugin.java" <<'JAVA'
package io.github.willyros01.spendrecorder;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

@CapacitorPlugin(name = "SpendRecorderDocument", permissions = {
  @Permission(alias = "legacyStorage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
})
public class SpendRecorderDocumentPlugin extends Plugin {
  private static String typeFor(String name) {
    if (name == null || !name.matches("spendrecorder-[0-9]{4}-[0-9]{2}-[0-9]{2}\\.(csv|xlsx)")) return null;
    if (name.endsWith(".csv")) return "text/csv";
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  private byte[] getBytes(PluginCall call) throws IOException {
    String name = call.getString("fileName");
    String mime = call.getString("mimeType");
    String data = call.getString("base64");
    String expected = typeFor(name);
    if (expected == null || !expected.equals(mime) || data == null || data.isEmpty()) {
      throw new IOException("Invalid export name, type or contents");
    }
    try {
      byte[] out = Base64.decode(data, Base64.DEFAULT);
      if (out.length == 0) throw new IOException("Empty export");
      return out;
    } catch (IllegalArgumentException error) {
      throw new IOException("Invalid encoded export");
    }
  }

  @PluginMethod
  public void saveToDownloads(PluginCall call) {
    try {
      getBytes(call); // fail before any storage permission prompt
    } catch (IOException error) {
      call.reject(error.getMessage());
      return;
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      writeMediaStore(call);
      return;
    }
    if (getPermissionState("legacyStorage") != PermissionState.GRANTED) {
      requestPermissionForAlias("legacyStorage", call, "legacyPermissionResult");
      return;
    }
    writeLegacy(call);
  }

  @PermissionCallback
  private void legacyPermissionResult(PluginCall call) {
    if (call == null) return;
    if (getPermissionState("legacyStorage") != PermissionState.GRANTED) {
      call.reject("Storage permission denied. Allow file access to save into Downloads.");
      return;
    }
    writeLegacy(call);
  }

  private void success(PluginCall call, String fileName) {
    JSObject result = new JSObject();
    result.put("saved", true);
    result.put("fileName", fileName);
    result.put("location", "Downloads");
    call.resolve(result);
  }

  private void writeMediaStore(PluginCall call) {
    ContentResolver resolver = getContext().getContentResolver();
    ContentValues values = new ContentValues();
    String name = call.getString("fileName");
    values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
    values.put(MediaStore.MediaColumns.MIME_TYPE, typeFor(name));
    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/");
    values.put(MediaStore.MediaColumns.IS_PENDING, 1);
    Uri location = null;
    try {
      byte[] bytes = getBytes(call);
      location = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
      if (location == null) throw new IOException("Android Downloads storage is unavailable");
      try (OutputStream output = resolver.openOutputStream(location, "w")) {
        if (output == null) throw new IOException("Cannot write to Downloads");
        output.write(bytes);
        output.flush();
      }
      ContentValues ready = new ContentValues();
      ready.put(MediaStore.MediaColumns.IS_PENDING, 0);
      if (resolver.update(location, ready, null, null) < 1) {
        throw new IOException("Unable to finalize the exported file");
      }
      String actualName = name;
      try (android.database.Cursor cursor = resolver.query(location,
          new String[] { MediaStore.MediaColumns.DISPLAY_NAME }, null, null, null)) {
        if (cursor != null && cursor.moveToFirst()) actualName = cursor.getString(0);
      } catch (Exception ignored) {
        // The file was already finalized; display name lookup is optional.
      }
      success(call, actualName);
    } catch (Exception error) {
      if (location != null) {
        try { resolver.delete(location, null, null); } catch (Exception ignored) { }
      }
      call.reject("Export was NOT saved: " + error.getMessage());
    }
  }

  @SuppressWarnings("deprecation")
  private void writeLegacy(PluginCall call) {
    String name = call.getString("fileName");
    File file = null;
    try {
      byte[] bytes = getBytes(call);
      if (!Environment.MEDIA_MOUNTED.equals(Environment.getExternalStorageState())) {
        throw new IOException("Device storage is not mounted");
      }
      File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
      if (!dir.exists() && !dir.mkdirs()) throw new IOException("Cannot create Downloads folder");
      String ext = name.endsWith(".xlsx") ? ".xlsx" : ".csv";
      String base = name.substring(0, name.length() - ext.length());
      file = new File(dir, name);
      for (int suffix = 2; file.exists(); suffix++) {
        if (suffix > 1000) throw new IOException("Too many saved copies");
        file = new File(dir, base + "-" + suffix + ext);
      }
      if (!file.createNewFile()) throw new IOException("Could not create export file");
      try (OutputStream output = new FileOutputStream(file)) {
        output.write(bytes);
        output.flush();
      } catch (Exception error) {
        file.delete();
        throw error;
      }
      success(call, file.getName());
    } catch (Exception error) {
      call.reject("Export was NOT saved: " + error.getMessage());
    }
  }
}
JAVA
# Android 9 and earlier only; modern Fire OS / Android uses MediaStore Downloads.
python3 - <<'PY'
from pathlib import Path
manifest = Path("android/app/src/main/AndroidManifest.xml")
source = manifest.read_text()
marker = '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />'
if marker not in source:
    assert "<application" in source, "Unexpected AndroidManifest format"
    manifest.write_text(source.replace("<application", marker + "\n    <application", 1))
PY
