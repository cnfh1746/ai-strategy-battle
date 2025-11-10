@echo off
chcp 65001 >nul
echo ========================================
echo   AI策略对战 - 一键上传到GitHub
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] 添加所有文件...
git add .
if errorlevel 1 (
    echo 错误: 添加文件失败
    exit /b 1
)

echo [2/4] 创建提交...
set commit_msg=Update: Automated UI improvements
git commit -m "%commit_msg%"

echo [3/4] 检查远程仓库...
git remote | findstr origin >nul
if errorlevel 1 (
    echo 添加远程仓库...
    git remote add origin https://github.com/cnfh1746/ai-strategy-battle.git
)

echo [4/4] 推送到GitHub...
git branch -M main
git push -u origin main

if errorlevel 1 (
    echo.
    echo ========================================
    echo   推送失败！可能的原因：
    echo   1. 网络连接问题
    echo   2. 需要配置Git凭据
    echo   3. 仓库权限问题
    echo ========================================
    echo.
    echo 可以尝试强制推送：
    echo git push -f origin main
    exit /b 1
) else (
    echo.
    echo ========================================
    echo   ✓ 成功推送到GitHub！
    echo   仓库地址: https://github.com/cnfh1746/ai-strategy-battle
    echo ========================================
)

echo.
