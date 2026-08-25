fn main() {
    tauri_build::build();

    // sherpa-onnx 静态库需要额外的 Windows 系统库
    #[cfg(target_os = "windows")]
    {
        println!("cargo:rustc-link-lib=advapi32");

        // tauri-winres 需要 RC.exe，设置路径
        let rc_path = "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64\\rc.exe";
        println!("cargo:rustc-env=RC={}", rc_path);
    }
}
