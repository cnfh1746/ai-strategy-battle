@echo off
chcp 65001 >nul
echo ========================================
echo    AI策略对战 - Git 上传脚本
echo ========================================
echo.

REM 检查是否是git仓库
if not exist ".git" (
    echo [1/6] 初始化Git仓库...
    git init
    echo.
)

REM 设置远程仓库
echo [2/6] 设置远程仓库...
git remote remove origin 2>nul
git remote add origin https://github.com/cnfh1746/ai-strategy-battle.git
echo.

REM 添加所有文件
echo [3/6] 添加文件到暂存区...
git add .
echo.

REM 提交
echo [4/6] 提交更改...
set /p commit_msg="请输入提交信息 (直接回车使用默认): "
if "%commit_msg%"=="" set commit_msg=Update: 更新代码
git commit -m "%commit_msg%"
echo.

REM 推送到远程
echo [5/6] 推送到GitHub...
git branch -M main
git push -u origin main --force
echo.

echo [6/6] 完成！
echo ========================================
echo 代码已成功上传到:
echo https://github.com/cnfh1746/ai-strategy-battle
echo ========================================
echo.
pause
