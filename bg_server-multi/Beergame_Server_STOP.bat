@echo off

cd jdk

echo
echo setting BEERGAME_JAVA_HOME and BEERGAME_JRE_HOME for Beergame USB-Stick
set BEERGAME_JAVA_HOME=%cd%
set BEERGAME_JRE_HOME=%cd%
echo to %BEERGAME_JAVA_HOME%

cd ..
cd tomcat
cd webapps
cd BeergameProject
cd beergame

set BEERGAME_PATH=%cd%
echo setting BEERGAME_PATH to %BEERGAME_PATH%

set JAVA_OPTS=%JAVA_OPTS% -DBEERGAME_PATH=%BEERGAME_PATH%
echo setting JAVA_OPTS to %JAVA_OPTS%

cd ..
cd ..
cd ..
cd tomcat
cd bin
shutdown.bat

