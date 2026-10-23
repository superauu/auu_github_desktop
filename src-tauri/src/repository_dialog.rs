pub const ACCESS_CANCELLED: &str = "AUUGIT_REPOSITORY_ACCESS_CANCELLED";

pub struct RepositoryDialogText {
    pub title: &'static str,
    pub message: &'static str,
    pub allow: &'static str,
    pub cancel: &'static str,
    pub picker_title: &'static str,
}

pub fn text(language: Option<&str>) -> RepositoryDialogText {
    if language == Some("en") {
        RepositoryDialogText {
            title: "AuuGit — Repository access",
            message: "Allow AuuGit to access this repository directory?",
            allow: "Allow",
            cancel: "Cancel",
            picker_title: "Select a repository directory",
        }
    } else {
        RepositoryDialogText {
            title: "AuuGit — 仓库访问授权",
            message: "是否允许 AuuGit 访问此仓库目录？",
            allow: "允许",
            cancel: "取消",
            picker_title: "选择仓库目录",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dialog_follows_the_explicit_app_language() {
        let zh = text(Some("zh"));
        assert_eq!(zh.title, "AuuGit — 仓库访问授权");
        assert_eq!(zh.message, "是否允许 AuuGit 访问此仓库目录？");
        assert_eq!((zh.allow, zh.cancel), ("允许", "取消"));
        assert_eq!(zh.picker_title, "选择仓库目录");
        let en = text(Some("en"));
        assert_eq!(en.title, "AuuGit — Repository access");
        assert_eq!(
            en.message,
            "Allow AuuGit to access this repository directory?"
        );
        assert_eq!((en.allow, en.cancel), ("Allow", "Cancel"));
        assert_eq!(en.picker_title, "Select a repository directory");
        assert_eq!(text(None).title, zh.title);
        assert_eq!(text(Some("unknown")).title, zh.title);
    }
}
