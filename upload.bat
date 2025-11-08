@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo    AI策略对战 - GitHub上传工具
echo ========================================
echo.
echo 当前目录: %CD%
echo.

echo [步骤 1/5] 初始化Git仓库...
if not exist ".git" (
    git init
    echo Git仓库初始化完成
) else (
    echo Git仓库已存在
)
echo.

echo [步骤 2/5] 配置远程仓库...
git remote remove origin 2>nul
git remote add origin https://github.com/cnfh1746/ai-strategy-battle.git
echo 远程仓库已设置: https://github.com/cnfh1746/ai-strategy-battle.git
echo.

echo [步骤 3/5] 添加文件...
git add .
echo 文件已添加到暂存区
echo.

echo [步骤 4/5] 提交更改...
set /p msg="输入提交信息 (回车使用默认): "
if "%msg%"=="" set msg=Initial commit: AI策略对战扩展v1.0
git commit -m "%msg%"
echo.

echo [步骤 5/5] 推送到GitHub...
git branch -M main
git push -f origin main
echo.

echo ========================================
echo          上传完成！
echo ========================================
echo 访问你的仓库: 
echo https://github.com/cnfh1746/ai-strategy-battle
echo ========================================
pause
