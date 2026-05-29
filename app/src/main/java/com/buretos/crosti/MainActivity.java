package com.buretos.crosti;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.database.Cursor;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int REQUEST_OPEN_JSON = 10;
    private static final int REQUEST_SAVE_JSON = 11;
    private static final String LAST_WORK_FILE = "last-work.json";

    private WebView webView;
    private String pickedJsonName = "";
    private String pickedJsonText = "";
    private String pendingExportText = "";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                restoreLastWork();
            }
        });
        webView.loadUrl("file:///android_asset/index.html");
    }

    private void restoreLastWork() {
        File file = new File(getFilesDir(), LAST_WORK_FILE);
        if (!file.isFile()) return;
        try {
            String text = readAll(new FileInputStream(file));
            runJavaScript("window.importJsonFromAndroid('last-work.json', " + JSONObject.quote(text) + ");");
        } catch (Exception error) {
            Toast.makeText(this, "Не удалось восстановить сохраненную работу", Toast.LENGTH_LONG).show();
        }
    }

    private void importPickedJson(Uri uri) {
        try {
            pickedJsonName = displayName(uri);
            pickedJsonText = readAll(getContentResolver().openInputStream(uri));
            runJavaScript("window.importJsonFromAndroid(" + JSONObject.quote(pickedJsonName) + ", " + JSONObject.quote(pickedJsonText) + ");");
        } catch (Exception error) {
            runJavaScript("window.cancelJsonImportFromAndroid();");
            Toast.makeText(this, "Не удалось открыть JSON", Toast.LENGTH_LONG).show();
        }
    }

    private void exportJson(Uri uri) {
        try (OutputStream output = getContentResolver().openOutputStream(uri)) {
            if (output == null) throw new IllegalStateException("No output stream");
            output.write(pendingExportText.getBytes(StandardCharsets.UTF_8));
            Toast.makeText(this, "JSON сохранен", Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            Toast.makeText(this, "Не удалось сохранить JSON", Toast.LENGTH_LONG).show();
        }
    }

    private void persistViewerState(String json) {
        try (FileOutputStream output = openFileOutput(LAST_WORK_FILE, MODE_PRIVATE)) {
            output.write(json.getBytes(StandardCharsets.UTF_8));
        } catch (Exception error) {
            runOnUiThread(() -> Toast.makeText(this, "Не удалось сохранить состояние", Toast.LENGTH_LONG).show());
        }
    }

    private void runJavaScript(String script) {
        runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (Exception ignored) {
        }
        return "project.json";
    }

    private static String readAll(InputStream input) throws Exception {
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = stream.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            if (requestCode == REQUEST_OPEN_JSON) runJavaScript("window.cancelJsonImportFromAndroid();");
            return;
        }
        if (requestCode == REQUEST_OPEN_JSON) {
            importPickedJson(data.getData());
        } else if (requestCode == REQUEST_SAVE_JSON) {
            exportJson(data.getData());
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    public class Bridge {
        @JavascriptInterface
        public void openJsonPicker() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                startActivityForResult(intent, REQUEST_OPEN_JSON);
            });
        }

        @JavascriptInterface
        public String consumePickedJsonName() {
            return pickedJsonName;
        }

        @JavascriptInterface
        public String consumePickedJsonText() {
            return pickedJsonText;
        }

        @JavascriptInterface
        public void persistViewerState(String json) {
            MainActivity.this.persistViewerState(json);
        }

        @JavascriptInterface
        public void saveJson(String fileName, String json) {
            persistViewerState(json);
            pendingExportText = json;
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, fileName);
                startActivityForResult(intent, REQUEST_SAVE_JSON);
            });
        }
    }
}
