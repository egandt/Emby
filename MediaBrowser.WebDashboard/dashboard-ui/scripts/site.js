﻿(function () {

    function onOneDocumentClick() {

        document.removeEventListener('click', onOneDocumentClick);

        if (window.Notification) {
            Notification.requestPermission();
        }
    }
    document.addEventListener('click', onOneDocumentClick);

})();

var Dashboard = {

    isConnectMode: function () {

        if (AppInfo.isNativeApp) {
            return true;
        }

        var url = window.location.href.toLowerCase();

        return url.indexOf('mediabrowser.tv') != -1 ||
            url.indexOf('emby.media') != -1;
    },

    isRunningInCordova: function () {

        return window.appMode == 'cordova';
    },

    onRequestFail: function (e, data) {

        if (data.status == 401) {

            var url = data.url.toLowerCase();

            // Don't bounce to login on failures to contact our external servers
            if (url.indexOf('emby.media') != -1 || url.indexOf('mb3admin.com') != -1) {
                Dashboard.hideLoadingMsg();
                return;
            }

            // Don't bounce if the failure is in a sync service
            if (url.indexOf('/sync') != -1) {
                Dashboard.hideLoadingMsg();
                return;
            }

            // Bounce to the login screen, but not if a password entry fails, obviously
            if (url.indexOf('/password') == -1 &&
                url.indexOf('/authenticate') == -1 &&
                !ViewManager.currentView().classList.contains('.standalonePage')) {

                if (data.errorCode == "ParentalControl") {

                    Dashboard.alert({
                        message: Globalize.translate('MessageLoggedOutParentalControl'),
                        callback: function () {
                            Dashboard.logout(false);
                        }
                    });

                } else {
                    Dashboard.logout(false);
                }
            }
            return;
            Dashboard.hideLoadingMsg();
        }
    },

    onPopupOpen: function () {
        Dashboard.popupCount = (Dashboard.popupCount || 0) + 1;
        document.body.classList.add('bodyWithPopupOpen');
    },

    onPopupClose: function () {

        Dashboard.popupCount = (Dashboard.popupCount || 1) - 1;

        if (!Dashboard.popupCount) {
            document.body.classList.remove('bodyWithPopupOpen');
        }
    },

    getCurrentUser: function () {

        return window.ApiClient.getCurrentUser();
    },

    serverAddress: function () {

        if (Dashboard.isConnectMode()) {
            var apiClient = window.ApiClient;

            if (apiClient) {
                return apiClient.serverAddress();
            }

            return null;
        }

        // Try to get the server address from the browser url
        // This will preserve protocol, hostname, port and subdirectory
        var urlLower = window.location.href.toLowerCase();
        var index = urlLower.lastIndexOf('/web');

        if (index != -1) {
            return urlLower.substring(0, index);
        }

        // If the above failed, just piece it together manually
        var loc = window.location;

        var address = loc.protocol + '//' + loc.hostname;

        if (loc.port) {
            address += ':' + loc.port;
        }

        return address;
    },

    getCurrentUserId: function () {

        var apiClient = window.ApiClient;

        if (apiClient) {
            return apiClient.getCurrentUserId();
        }

        return null;
    },

    onServerChanged: function (userId, accessToken, apiClient) {

        apiClient = apiClient || window.ApiClient;

        window.ApiClient = apiClient;
    },

    logout: function (logoutWithServer) {

        function onLogoutDone() {

            var loginPage;

            if (Dashboard.isConnectMode()) {
                loginPage = 'connectlogin.html';
                window.ApiClient = null;
            } else {
                loginPage = 'login.html';
            }
            Dashboard.navigate(loginPage);
        }

        if (logoutWithServer === false) {
            onLogoutDone();
        } else {
            ConnectionManager.logout().then(onLogoutDone);
        }
    },

    updateSystemInfo: function (info) {

        Dashboard.lastSystemInfo = info;

        if (!Dashboard.initialServerVersion) {
            Dashboard.initialServerVersion = info.Version;
        }

        if (info.HasPendingRestart) {

            Dashboard.hideDashboardVersionWarning();

            Dashboard.getCurrentUser().then(function (currentUser) {

                if (currentUser.Policy.IsAdministrator) {
                    Dashboard.showServerRestartWarning(info);
                }
            });

        } else {

            Dashboard.hideServerRestartWarning();

            if (Dashboard.initialServerVersion != info.Version) {

                Dashboard.showDashboardRefreshNotification();
            }
        }

        Dashboard.showInProgressInstallations(info.InProgressInstallations);
    },

    showInProgressInstallations: function (installations) {

        installations = installations || [];

        for (var i = 0, length = installations.length; i < length; i++) {

            var installation = installations[i];

            var percent = installation.PercentComplete || 0;

            if (percent < 100) {
                Dashboard.showPackageInstallNotification(installation, "progress");
            }
        }

        if (installations.length) {

            Dashboard.ensureInstallRefreshInterval();
        } else {
            Dashboard.stopInstallRefreshInterval();
        }
    },

    ensureInstallRefreshInterval: function () {

        if (!Dashboard.installRefreshInterval) {

            if (ApiClient.isWebSocketOpen()) {
                ApiClient.sendWebSocketMessage("SystemInfoStart", "0,500");
            }
            Dashboard.installRefreshInterval = 1;
        }
    },

    stopInstallRefreshInterval: function () {

        if (Dashboard.installRefreshInterval) {
            if (ApiClient.isWebSocketOpen()) {
                ApiClient.sendWebSocketMessage("SystemInfoStop");
            }
            Dashboard.installRefreshInterval = null;
        }
    },

    cancelInstallation: function (id) {

        ApiClient.cancelPackageInstallation(id).then(Dashboard.refreshSystemInfoFromServer, Dashboard.refreshSystemInfoFromServer);

    },

    showServerRestartWarning: function (systemInfo) {

        if (AppInfo.isNativeApp) {
            return;
        }

        var html = '<span style="margin-right: 1em;">' + Globalize.translate('MessagePleaseRestart') + '</span>';

        if (systemInfo.CanSelfRestart) {
            html += '<button is="emby-button" type="button" class="raised submit mini" onclick="this.disabled=\'disabled\';Dashboard.restartServer();"><i class="md-icon">refresh</i><span>' + Globalize.translate('ButtonRestart') + '</span></button>';
        }

        Dashboard.showFooterNotification({ id: "serverRestartWarning", html: html, forceShow: true, allowHide: false });
    },

    hideServerRestartWarning: function () {

        var elem = document.getElementById('serverRestartWarning');
        if (elem) {
            elem.parentNode.removeChild(elem);
        }
    },

    showDashboardRefreshNotification: function () {

        if (AppInfo.isNativeApp) {
            return;
        }

        var html = '<span style="margin-right: 1em;">' + Globalize.translate('MessagePleaseRefreshPage') + '</span>';

        html += '<button is="emby-button" type="button" class="raised submit mini" onclick="this.disabled=\'disabled\';Dashboard.reloadPage();"><i class="md-icon">refresh</i><span>' + Globalize.translate('ButtonRefresh') + '</span></button>';

        Dashboard.showFooterNotification({ id: "dashboardVersionWarning", html: html, forceShow: true, allowHide: false });
    },

    reloadPage: function () {

        window.location.reload(true);
    },

    hideDashboardVersionWarning: function () {

        var elem = document.getElementById('dashboardVersionWarning');

        if (elem) {

            elem.parentNode.removeChild(elem);
        }
    },

    showFooterNotification: function (options) {

        var removeOnHide = !options.id;

        options.id = options.id || "notification" + new Date().getTime() + parseInt(Math.random());

        if (!document.querySelector(".footer")) {

            var footerHtml = '<div id="footer" class="footer" data-theme="b" class="ui-bar-b">';

            footerHtml += '<div id="footerNotifications"></div>';
            footerHtml += '</div>';

            document.body.insertAdjacentHTML('beforeend', footerHtml);
        }

        var footer = document.querySelector('.footer');
        footer.style.top = 'initial';
        footer.classList.remove('hide');

        var parentElem = footer.querySelector('#footerNotifications');

        var notificationElementId = 'notification' + options.id;

        var elem = parentElem.querySelector('#' + notificationElementId);

        if (!elem) {
            parentElem.insertAdjacentHTML('beforeend', '<p id="' + notificationElementId + '" class="footerNotification"></p>');
            elem = parentElem.querySelector('#' + notificationElementId);
        }

        var onclick = removeOnHide ? "jQuery('#" + notificationElementId + "').trigger('notification.remove').remove();" : "jQuery('#" + notificationElementId + "').trigger('notification.hide').hide();";

        if (options.allowHide !== false) {
            options.html += '<span style="margin-left: 1em;"><button is="emby-button" type="button" class="submit" onclick="' + onclick + '">' + Globalize.translate('ButtonHide') + "</button></span>";
        }

        if (options.forceShow) {
            elem.classList.remove('hide');
        }

        elem.innerHTML = options.html;

        if (options.timeout) {

            setTimeout(function () {

                if (removeOnHide) {
                    $(elem).trigger("notification.remove").remove();
                } else {
                    $(elem).trigger("notification.hide").hide();
                }

            }, options.timeout);
        }

        $(footer).on("notification.remove notification.hide", function (e) {

            setTimeout(function () { // give the DOM time to catch up

                if (!parentElem.innerHTML) {
                    footer.classList.add('hide');
                }

            }, 50);

        });
    },

    getConfigurationPageUrl: function (name) {
        return "configurationpage?name=" + encodeURIComponent(name);
    },

    navigate: function (url, preserveQueryString) {

        if (!url) {
            throw new Error('url cannot be null or empty');
        }

        var queryString = getWindowLocationSearch();
        if (preserveQueryString && queryString) {
            url += queryString;
        }

        if (url.indexOf('/') != 0) {
            if (url.indexOf('http') != 0 && url.indexOf('file:') != 0) {
                url = '/' + url;
            }
        }
        Emby.Page.show(url);
    },

    showLoadingMsg: function () {

        Dashboard.loadingVisible = true;

        require(['loading'], function (loading) {
            if (Dashboard.loadingVisible) {
                loading.show();
            } else {
                loading.hide();
            }
        });
    },

    hideLoadingMsg: function () {

        Dashboard.loadingVisible = false;

        require(['loading'], function (loading) {
            if (Dashboard.loadingVisible) {
                loading.show();
            } else {
                loading.hide();
            }
        });
    },

    getModalLoadingMsg: function () {

        var elem = document.querySelector('.modalLoading');

        if (!elem) {

            elem = document.createElement('modalLoading');
            elem.classList.add('modalLoading');
            elem.classList.add('hide');
            document.body.appendChild(elem);

        }

        return elem;
    },

    showModalLoadingMsg: function () {
        Dashboard.getModalLoadingMsg().classList.remove('hide');
        Dashboard.showLoadingMsg();
    },

    hideModalLoadingMsg: function () {
        Dashboard.getModalLoadingMsg().classList.add('hide');
        Dashboard.hideLoadingMsg();
    },

    processPluginConfigurationUpdateResult: function () {

        Dashboard.hideLoadingMsg();

        require(['toast'], function (toast) {
            toast(Globalize.translate('MessageSettingsSaved'));
        });
    },

    processServerConfigurationUpdateResult: function (result) {

        Dashboard.hideLoadingMsg();

        require(['toast'], function (toast) {
            toast(Globalize.translate('MessageSettingsSaved'));
        });
    },

    processErrorResponse: function (response) {

        Dashboard.hideLoadingMsg();

        var status = '' + response.status;

        if (response.statusText) {
            status = response.statusText;
        }

        Dashboard.alert({
            title: status,
            message: response.headers ? response.headers.get('X-Application-Error-Code') : null
        });
    },

    alert: function (options) {

        if (typeof options == "string") {

            require(['toast'], function (toast) {

                toast({
                    text: options
                });

            });

            return;
        }

        require(['alert'], function (alert) {
            alert({
                title: options.title || Globalize.translate('HeaderAlert'),
                text: options.message
            }).then(options.callback || function () { });
        });
    },

    refreshSystemInfoFromServer: function () {

        var apiClient = ApiClient;

        if (apiClient && apiClient.accessToken()) {
            if (AppInfo.enableFooterNotifications) {
                apiClient.getSystemInfo().then(function (info) {

                    Dashboard.updateSystemInfo(info);
                });
            }
        }
    },

    restartServer: function () {

        Dashboard.suppressAjaxErrors = true;
        Dashboard.showLoadingMsg();

        ApiClient.restartServer().then(function () {

            setTimeout(function () {
                Dashboard.reloadPageWhenServerAvailable();
            }, 250);

        }, function () {
            Dashboard.suppressAjaxErrors = false;
        });
    },

    reloadPageWhenServerAvailable: function (retryCount) {

        // Don't use apiclient method because we don't want it reporting authentication under the old version
        ApiClient.getJSON(ApiClient.getUrl("System/Info")).then(function (info) {

            // If this is back to false, the restart completed
            if (!info.HasPendingRestart) {
                Dashboard.reloadPage();
            } else {
                Dashboard.retryReload(retryCount);
            }

        }, function () {
            Dashboard.retryReload(retryCount);
        });
    },

    retryReload: function (retryCount) {
        setTimeout(function () {

            retryCount = retryCount || 0;
            retryCount++;

            if (retryCount < 10) {
                Dashboard.reloadPageWhenServerAvailable(retryCount);
            } else {
                Dashboard.suppressAjaxErrors = false;
            }
        }, 500);
    },

    showUserFlyout: function () {

        Dashboard.navigate('mypreferencesmenu.html?userId=' + ApiClient.getCurrentUserId());
    },

    getPluginSecurityInfo: function () {

        var apiClient = ApiClient;

        if (!apiClient) {

            return Promise.reject();
        }

        var cachedInfo = Dashboard.pluginSecurityInfo;
        if (cachedInfo) {
            return Promise.resolve(cachedInfo);
        }

        return apiClient.ajax({
            type: "GET",
            url: apiClient.getUrl("Plugins/SecurityInfo"),
            dataType: 'json',

            error: function () {
                // Don't show normal dashboard errors
            }

        }).then(function (result) {
            Dashboard.pluginSecurityInfo = result;
            return result;
        });
    },

    resetPluginSecurityInfo: function () {
        Dashboard.pluginSecurityInfo = null;
    },

    ensureHeader: function (page) {

        if (page.classList.contains('standalonePage') && !page.classList.contains('noHeaderPage')) {

            Dashboard.renderHeader(page);
        }
    },

    renderHeader: function (page) {

        var header = page.querySelector('.header');

        if (!header) {
            var headerHtml = '';

            headerHtml += '<div class="header">';

            headerHtml += '<a class="logo" href="home.html" style="text-decoration:none;font-size: 22px;">';

            if (page.classList.contains('standalonePage')) {

                headerHtml += '<img class="imgLogoIcon" src="css/images/mblogoicon.png" />';
                headerHtml += '<span class="logoLibraryMenuButtonText">EMBY</span>';
            }

            headerHtml += '</a>';

            headerHtml += '</div>';
            page.insertAdjacentHTML('afterbegin', headerHtml);
        }
    },

    getToolsLinkHtml: function (item) {

        var menuHtml = '';
        var pageIds = item.pageIds ? item.pageIds.join(',') : '';
        pageIds = pageIds ? (' data-pageids="' + pageIds + '"') : '';
        menuHtml += '<a class="sidebarLink" href="' + item.href + '"' + pageIds + '>';

        var icon = item.icon;

        if (icon) {
            var style = item.color ? ' style="color:' + item.color + '"' : '';

            menuHtml += '<i class="md-icon sidebarLinkIcon"' + style + '>' + icon + '</i>';
        }

        menuHtml += '<span class="sidebarLinkText">';
        menuHtml += item.name;
        menuHtml += '</span>';
        menuHtml += '</a>';
        return menuHtml;
    },

    getToolsMenuHtml: function (page) {

        var items = Dashboard.getToolsMenuLinks(page);

        var i, length, item;
        var menuHtml = '';
        menuHtml += '<div class="drawerContent">';
        for (i = 0, length = items.length; i < length; i++) {

            item = items[i];

            if (item.divider) {
                menuHtml += "<div class='sidebarDivider'></div>";
            }

            if (item.items) {

                var style = item.color ? ' iconstyle="color:' + item.color + '"' : '';
                var expanded = item.expanded ? (' expanded') : '';
                if (item.icon) {
                    menuHtml += '<emby-collapsible icon="' + item.icon + '" title="' + item.name + '"' + style + expanded + '>';
                } else {
                    menuHtml += '<emby-collapsible title="' + item.name + '"' + style + expanded + '>';
                }
                menuHtml += item.items.map(Dashboard.getToolsLinkHtml).join('');
                menuHtml += '</emby-collapsible>';
            }
            else if (item.href) {

                menuHtml += Dashboard.getToolsLinkHtml(item);
            } else {

                menuHtml += '<div class="sidebarHeader">';
                menuHtml += item.name;
                menuHtml += '</div>';
            }
        }
        menuHtml += '</div>';

        return menuHtml;
    },

    getToolsMenuLinks: function () {

        return [{
            name: Globalize.translate('TabServer')
        }, {
            name: Globalize.translate('TabDashboard'),
            href: "dashboard.html",
            pageIds: ['dashboardPage'],
            icon: 'dashboard'
        }, {
            name: Globalize.translate('TabSettings'),
            href: "dashboardgeneral.html",
            pageIds: ['dashboardGeneralPage'],
            icon: 'settings'
        }, {
            name: Globalize.translate('TabDevices'),
            href: "devices.html",
            pageIds: ['devicesPage', 'devicePage'],
            icon: 'tablet'
        }, {
            name: Globalize.translate('TabUsers'),
            href: "userprofiles.html",
            pageIds: ['userProfilesPage', 'newUserPage', 'editUserPage', 'userLibraryAccessPage', 'userParentalControlPage', 'userPasswordPage'],
            icon: 'people'
        }, {
            name: 'Emby Premiere',
            href: "supporterkey.html",
            pageIds: ['supporterKeyPage'],
            icon: 'star'
        }, {
            divider: true,
            name: Globalize.translate('TabLibrary'),
            href: "library.html",
            pageIds: ['mediaLibraryPage', 'libraryPathMappingPage', 'librarySettingsPage', 'libraryDisplayPage'],
            icon: 'folder',
            color: '#38c'
        }, {
            name: Globalize.translate('TabMetadata'),
            href: "metadata.html",
            pageIds: ['metadataConfigurationPage', 'metadataImagesConfigurationPage', 'metadataNfoPage'],
            icon: 'insert_drive_file',
            color: '#FF9800'
        }, {
            name: Globalize.translate('TabSubtitles'),
            href: "metadatasubtitles.html",
            pageIds: ['metadataSubtitlesPage'],
            icon: 'closed_caption'
        }, {
            name: Globalize.translate('TabPlayback'),
            icon: 'play_circle_filled',
            color: '#E5342E',
            href: "cinemamodeconfiguration.html",
            pageIds: ['cinemaModeConfigurationPage', 'playbackConfigurationPage', 'streamingSettingsPage', 'encodingSettingsPage']
        }, {
            name: Globalize.translate('TabSync'),
            icon: 'sync',
            href: "syncactivity.html",
            pageIds: ['syncActivityPage', 'syncJobPage', 'devicesUploadPage', 'syncSettingsPage'],
            color: '#009688'
        }, {
            divider: true,
            name: Globalize.translate('TabExtras')
        }, {
            name: Globalize.translate('TabAutoOrganize'),
            color: '#01C0DD',
            href: "autoorganizelog.html",
            pageIds: ['libraryFileOrganizerPage', 'libraryFileOrganizerSmartMatchPage', 'libraryFileOrganizerLogPage'],
            icon: 'folder'
        }, {
            name: Globalize.translate('DLNA'),
            href: "dlnasettings.html",
            pageIds: ['dlnaSettingsPage', 'dlnaProfilesPage', 'dlnaProfilePage'],
            icon: 'settings'
        }, {
            name: Globalize.translate('TabLiveTV'),
            href: "livetvstatus.html",
            pageIds: ['liveTvStatusPage', 'liveTvSettingsPage', 'liveTvTunerProviderHdHomerunPage', 'liveTvTunerProviderM3UPage', 'liveTvTunerProviderSatPage'],
            icon: 'dvr'
        }, {
            name: Globalize.translate('TabNotifications'),
            icon: 'notifications',
            color: 'brown',
            href: "notificationsettings.html",
            pageIds: ['notificationSettingsPage', 'notificationSettingPage']
        }, {
            name: Globalize.translate('TabPlugins'),
            icon: 'add_shopping_cart',
            color: '#9D22B1',
            href: "plugins.html",
            pageIds: ['pluginsPage', 'pluginCatalogPage']
        }, {
            divider: true,
            name: Globalize.translate('TabExpert')
        }, {
            name: Globalize.translate('TabAdvanced'),
            icon: 'settings',
            href: "dashboardhosting.html",
            color: '#F16834',
            pageIds: ['dashboardHostingPage', 'serverSecurityPage']
        }, {
            name: Globalize.translate('TabLogs'),
            href: "log.html",
            pageIds: ['logPage'],
            icon: 'folder-open'
        }, {
            name: Globalize.translate('TabScheduledTasks'),
            href: "scheduledtasks.html",
            pageIds: ['scheduledTasksPage', 'scheduledTaskPage'],
            icon: 'schedule'
        }, {
            name: Globalize.translate('TabHelp'),
            href: "about.html",
            icon: 'help',
            color: '#679C34',
            divider: true,
            pageIds: ['aboutPage']
        }];

    },

    processGeneralCommand: function (cmd) {

        // Full list
        // https://github.com/MediaBrowser/MediaBrowser/blob/master/MediaBrowser.Model/Session/GeneralCommand.cs#L23

        switch (cmd.Name) {

            case 'GoHome':
                Dashboard.navigate('home.html');
                break;
            case 'GoToSettings':
                Dashboard.navigate('dashboard.html');
                break;
            case 'DisplayContent':
                Dashboard.onBrowseCommand(cmd.Arguments);
                break;
            case 'GoToSearch':
                Dashboard.navigate('search.html');
                break;
            case 'DisplayMessage':
                {
                    var args = cmd.Arguments;

                    if (args.TimeoutMs && window.Notification && Notification.permission === "granted") {

                        var notification = {
                            title: args.Header,
                            body: args.Text,
                            vibrate: true,
                            timeout: args.TimeoutMs
                        };

                        var notif = new Notification(notification.title, notification);

                        if (notif.show) {
                            notif.show();
                        }

                        if (notification.timeout) {
                            setTimeout(function () {

                                if (notif.close) {
                                    notif.close();
                                }
                                else if (notif.cancel) {
                                    notif.cancel();
                                }
                            }, notification.timeout);
                        }
                    }
                    else {
                        Dashboard.alert({ title: args.Header, message: args.Text });
                    }

                    break;
                }
            case 'VolumeUp':
            case 'VolumeDown':
            case 'Mute':
            case 'Unmute':
            case 'ToggleMute':
            case 'SetVolume':
            case 'SetAudioStreamIndex':
            case 'SetSubtitleStreamIndex':
            case 'ToggleFullscreen':
            case 'SetRepeatMode':
                break;
            default:
                console.log('Unrecognized command: ' + cmd.Name);
                break;
        }
    },

    onWebSocketMessageReceived: function (e, data) {

        var msg = data;

        if (msg.MessageType === "LibraryChanged") {
            Dashboard.processLibraryUpdateNotification(msg.Data);
        }
        else if (msg.MessageType === "ServerShuttingDown") {
            Dashboard.hideServerRestartWarning();
        }
        else if (msg.MessageType === "ServerRestarting") {
            Dashboard.hideServerRestartWarning();
        }
        else if (msg.MessageType === "SystemInfo") {
            Dashboard.updateSystemInfo(msg.Data);
        }
        else if (msg.MessageType === "RestartRequired") {
            Dashboard.updateSystemInfo(msg.Data);
        }
        else if (msg.MessageType === "PackageInstallationCompleted") {
            Dashboard.getCurrentUser().then(function (currentUser) {

                if (currentUser.Policy.IsAdministrator) {
                    Dashboard.showPackageInstallNotification(msg.Data, "completed");
                    Dashboard.refreshSystemInfoFromServer();
                }
            });
        }
        else if (msg.MessageType === "PackageInstallationFailed") {
            Dashboard.getCurrentUser().then(function (currentUser) {

                if (currentUser.Policy.IsAdministrator) {
                    Dashboard.showPackageInstallNotification(msg.Data, "failed");
                    Dashboard.refreshSystemInfoFromServer();
                }
            });
        }
        else if (msg.MessageType === "PackageInstallationCancelled") {
            Dashboard.getCurrentUser().then(function (currentUser) {

                if (currentUser.Policy.IsAdministrator) {
                    Dashboard.showPackageInstallNotification(msg.Data, "cancelled");
                    Dashboard.refreshSystemInfoFromServer();
                }
            });
        }
        else if (msg.MessaapiclientcgeType === "PackageInstalling") {
            Dashboard.getCurrentUser().then(function (currentUser) {

                if (currentUser.Policy.IsAdministrator) {
                    Dashboard.showPackageInstallNotification(msg.Data, "progress");
                    Dashboard.refreshSystemInfoFromServer();
                }
            });
        }
        else if (msg.MessageType === "GeneralCommand") {

            var cmd = msg.Data;
            // Media Controller should catch this
            //Dashboard.processGeneralCommand(cmd);
        }
    },

    onBrowseCommand: function (cmd) {

        var url;

        var type = (cmd.ItemType || "").toLowerCase();

        if (type == "genre") {
            url = "itemdetails.html?id=" + cmd.ItemId;
        }
        else if (type == "musicgenre") {
            url = "itemdetails.html?id=" + cmd.ItemId;
        }
        else if (type == "gamegenre") {
            url = "itemdetails.html?id=" + cmd.ItemId;
        }
        else if (type == "studio") {
            url = "itemdetails.html?id=" + cmd.ItemId;
        }
        else if (type == "person") {
            url = "itemdetails.html?id=" + cmd.ItemId;
        }
        else if (type == "musicartist") {
            url = "itemdetails.html?id=" + cmd.ItemId;
        }

        if (url) {
            Dashboard.navigate(url);
            return;
        }

        ApiClient.getItem(Dashboard.getCurrentUserId(), cmd.ItemId).then(function (item) {

            Dashboard.navigate(LibraryBrowser.getHref(item, null, ''));

        });

    },

    showPackageInstallNotification: function (installation, status) {

        if (AppInfo.isNativeApp) {
            return;
        }

        var html = '';

        if (status == 'completed') {
            html += '<img src="css/images/notifications/done.png" class="notificationIcon" />';
        }
        else if (status == 'cancelled') {
            html += '<img src="css/images/notifications/info.png" class="notificationIcon" />';
        }
        else if (status == 'failed') {
            html += '<img src="css/images/notifications/error.png" class="notificationIcon" />';
        }
        else if (status == 'progress') {
            html += '<img src="css/images/notifications/download.png" class="notificationIcon" />';
        }

        html += '<span style="margin-right: 1em;">';

        if (status == 'completed') {
            html += Globalize.translate('LabelPackageInstallCompleted').replace('{0}', installation.Name + ' ' + installation.Version);
        }
        else if (status == 'cancelled') {
            html += Globalize.translate('LabelPackageInstallCancelled').replace('{0}', installation.Name + ' ' + installation.Version);
        }
        else if (status == 'failed') {
            html += Globalize.translate('LabelPackageInstallFailed').replace('{0}', installation.Name + ' ' + installation.Version);
        }
        else if (status == 'progress') {
            html += Globalize.translate('LabelInstallingPackage').replace('{0}', installation.Name + ' ' + installation.Version);
        }

        html += '</span>';

        if (status == 'progress') {

            var percentComplete = Math.round(installation.PercentComplete || 0);

            html += '<progress style="margin-right: 1em;" max="100" value="' + percentComplete + '" title="' + percentComplete + '%">';
            html += '' + percentComplete + '%';
            html += '</progress>';

            if (percentComplete < 100) {
                html += '<button is="emby-button" type="button" class="raised cancelDark mini" onclick="this.disabled=\'disabled\';Dashboard.cancelInstallation(\'' + installation.Id + '\');"><iron-icon icon="cancel"></iron-icon><span>' + Globalize.translate('ButtonCancel') + '</span></button>';
            }
        }

        var timeout = 0;

        if (status == 'cancelled') {
            timeout = 2000;
        }

        var forceShow = status != "progress";
        var allowHide = status != "progress" && status != 'cancelled';

        Dashboard.showFooterNotification({ html: html, id: installation.Id, timeout: timeout, forceShow: forceShow, allowHide: allowHide });
    },

    processLibraryUpdateNotification: function (data) {

        var newItems = data.ItemsAdded;

        if (!newItems.length || AppInfo.isNativeApp || !window.Notification || Notification.permission !== "granted") {
            return;
        }

        ApiClient.getItems(Dashboard.getCurrentUserId(), {

            Recursive: true,
            Limit: 3,
            Filters: "IsNotFolder",
            SortBy: "DateCreated",
            SortOrder: "Descending",
            ImageTypes: "Primary",
            Ids: newItems.join(',')

        }).then(function (result) {

            var items = result.Items;

            for (var i = 0, length = Math.min(items.length, 2) ; i < length; i++) {

                var item = items[i];

                var notification = {
                    title: "New " + item.Type,
                    body: item.Name,
                    timeout: 15000,
                    vibrate: true,

                    data: {
                        options: {
                            url: LibraryBrowser.getHref(item)
                        }
                    }
                };

                var imageTags = item.ImageTags || {};

                if (imageTags.Primary) {

                    notification.icon = ApiClient.getScaledImageUrl(item.Id, {
                        width: 60,
                        tag: imageTags.Primary,
                        type: "Primary"
                    });
                }

                var notif = new Notification(notification.title, notification);

                if (notif.show) {
                    notif.show();
                }

                if (notification.timeout) {
                    setTimeout(function () {

                        if (notif.close) {
                            notif.close();
                        }
                        else if (notif.cancel) {
                            notif.cancel();
                        }
                    }, notification.timeout);
                }
            }
        });
    },

    setPageTitle: function (title, documentTitle) {

        LibraryMenu.setTitle(title || 'Emby');

        documentTitle = documentTitle || title;
        if (documentTitle) {
            document.title = documentTitle;
        }
    },

    getSupportedRemoteCommands: function () {

        // Full list
        // https://github.com/MediaBrowser/MediaBrowser/blob/master/MediaBrowser.Model/Session/GeneralCommand.cs
        return [
            "GoHome",
            "GoToSettings",
            "VolumeUp",
            "VolumeDown",
            "Mute",
            "Unmute",
            "ToggleMute",
            "SetVolume",
            "SetAudioStreamIndex",
            "SetSubtitleStreamIndex",
            "DisplayContent",
            "GoToSearch",
            "DisplayMessage",
            "SetRepeatMode"
        ];

    },

    isServerlessPage: function () {
        var url = window.location.href.toLowerCase();
        return url.indexOf('connectlogin.html') != -1 || url.indexOf('selectserver.html') != -1 || url.indexOf('login.html') != -1 || url.indexOf('forgotpassword.html') != -1 || url.indexOf('forgotpasswordpin.html') != -1;
    },

    capabilities: function () {

        var caps = {
            PlayableMediaTypes: ['Audio', 'Video'],

            SupportedCommands: Dashboard.getSupportedRemoteCommands(),

            // Need to use this rather than AppInfo.isNativeApp because the property isn't set yet at the time we call this
            SupportsPersistentIdentifier: Dashboard.isRunningInCordova(),

            SupportsMediaControl: true,
            SupportedLiveMediaTypes: ['Audio', 'Video']
        };

        if (Dashboard.isRunningInCordova() && !browserInfo.safari) {
            caps.SupportsOfflineAccess = true;
            caps.SupportsSync = true;
            caps.SupportsContentUploading = true;
        }

        return caps;
    },

    getDefaultImageQuality: function (imageType) {

        var quality = 90;
        var isBackdrop = imageType.toLowerCase() == 'backdrop';

        if (isBackdrop) {
            quality -= 10;
        }

        if (AppInfo.hasLowImageBandwidth) {

            // The native app can handle a little bit more than safari
            if (AppInfo.isNativeApp) {

                if (isBackdrop) {
                    quality -= 5;
                } else {
                    quality -= 10;
                }

            } else {

                quality -= 40;
            }
        }

        return quality;
    },

    normalizeImageOptions: function (options) {

        if (AppInfo.hasLowImageBandwidth) {

            options.enableImageEnhancers = false;
        }
    },

    loadExternalPlayer: function () {

        return new Promise(function (resolve, reject) {

            require(['scripts/externalplayer.js'], function () {

                if (Dashboard.isRunningInCordova()) {
                    require(['cordova/externalplayer.js'], resolve);
                } else {
                    resolve();
                }
            });
        });
    },

    exitOnBack: function () {

        var currentView = ViewManager.currentView();
        return !currentView || currentView.id == 'indexPage';
    },

    exit: function () {
        Dashboard.logout();
    },

    getDeviceProfile: function (maxHeight) {

        return new Promise(function (resolve, reject) {

            function updateDeviceProfileForAndroid(profile) {

                // Just here as an easy escape out, if ever needed
                var enableVlcVideo = true;
                var enableVlcAudio = window.VlcAudio;

                if (enableVlcVideo) {

                    profile.DirectPlayProfiles.push({
                        Container: "m4v,3gp,ts,mpegts,mov,xvid,vob,mkv,wmv,asf,ogm,ogv,m2v,avi,mpg,mpeg,mp4,webm,wtv",
                        Type: 'Video',
                        AudioCodec: 'aac,aac_latm,mp2,mp3,ac3,wma,dca,pcm,PCM_S16LE,PCM_S24LE,opus,flac'
                    });

                    profile.CodecProfiles = profile.CodecProfiles.filter(function (i) {
                        return i.Type == 'Audio';
                    });

                    profile.SubtitleProfiles = [];
                    profile.SubtitleProfiles.push({
                        Format: 'srt',
                        Method: 'External'
                    });
                    profile.SubtitleProfiles.push({
                        Format: 'srt',
                        Method: 'Embed'
                    });
                    profile.SubtitleProfiles.push({
                        Format: 'subrip',
                        Method: 'Embed'
                    });
                    profile.SubtitleProfiles.push({
                        Format: 'ass',
                        Method: 'Embed'
                    });
                    profile.SubtitleProfiles.push({
                        Format: 'ssa',
                        Method: 'Embed'
                    });
                    profile.SubtitleProfiles.push({
                        Format: 'pgs',
                        Method: 'Embed'
                    });
                    profile.SubtitleProfiles.push({
                        Format: 'pgssub',
                        Method: 'Embed'
                    });
                    profile.SubtitleProfiles.push({
                        Format: 'dvdsub',
                        Method: 'Embed'
                    });
                    profile.SubtitleProfiles.push({
                        Format: 'vtt',
                        Method: 'Embed'
                    });
                    profile.SubtitleProfiles.push({
                        Format: 'sub',
                        Method: 'Embed'
                    });
                    profile.SubtitleProfiles.push({
                        Format: 'idx',
                        Method: 'Embed'
                    });
                    profile.SubtitleProfiles.push({
                        Format: 'smi',
                        Method: 'Embed'
                    });

                    profile.CodecProfiles.push({
                        Type: 'Video',
                        Container: 'avi',
                        Conditions: [
                            {
                                Condition: 'NotEqual',
                                Property: 'CodecTag',
                                Value: 'xvid'
                            }
                        ]
                    });

                    profile.CodecProfiles.push({
                        Type: 'VideoAudio',
                        Codec: 'aac,mp3',
                        Conditions: [
                            {
                                Condition: 'LessThanEqual',
                                Property: 'AudioChannels',
                                Value: '6'
                            }
                        ]
                    });

                    profile.CodecProfiles.push({
                        Type: 'Video',
                        Codec: 'h264',
                        Conditions: [
                        {
                            Condition: 'EqualsAny',
                            Property: 'VideoProfile',
                            Value: 'high|main|baseline|constrained baseline'
                        },
                        {
                            Condition: 'LessThanEqual',
                            Property: 'VideoLevel',
                            Value: '41'
                        }]
                    });

                    profile.TranscodingProfiles.filter(function (p) {

                        return p.Type == 'Video' && p.CopyTimestamps == true;

                    }).forEach(function (p) {

                        // Vlc doesn't seem to handle this well
                        p.CopyTimestamps = false;
                    });

                    profile.TranscodingProfiles.filter(function (p) {

                        return p.Type == 'Video' && p.VideoCodec == 'h264';

                    }).forEach(function (p) {

                        p.AudioCodec += ',ac3';
                    });
                }

                if (enableVlcAudio) {

                    profile.DirectPlayProfiles.push({
                        Container: "aac,mp3,mpa,wav,wma,mp2,ogg,oga,webma,ape,opus",
                        Type: 'Audio'
                    });

                    profile.CodecProfiles = profile.CodecProfiles.filter(function (i) {
                        return i.Type != 'Audio';
                    });

                    profile.CodecProfiles.push({
                        Type: 'Audio',
                        Conditions: [{
                            Condition: 'LessThanEqual',
                            Property: 'AudioChannels',
                            Value: '2'
                        }]
                    });
                }
            }

            require(['browserdeviceprofile', 'qualityoptions', 'appSettings'], function (profileBuilder, qualityoptions, appSettings) {

                var supportsCustomSeeking = false;
                if (!browserInfo.mobile) {
                    supportsCustomSeeking = true;
                } else if (AppInfo.isNativeApp && browserInfo.safari) {
                    if (navigator.userAgent.toLowerCase().indexOf('ipad') == -1) {
                        // Need to disable it in order to support picture in picture
                        supportsCustomSeeking = true;
                    }
                } else if (AppInfo.isNativeApp) {
                    supportsCustomSeeking = true;
                }

                var profile = profileBuilder({
                    supportsCustomSeeking: supportsCustomSeeking
                });

                if (!(AppInfo.isNativeApp && browserInfo.android)) {
                    profile.SubtitleProfiles.push({
                        Format: 'ass',
                        Method: 'External'
                    });
                    profile.SubtitleProfiles.push({
                        Format: 'ssa',
                        Method: 'External'
                    });
                }

                var bitrateSetting = appSettings.maxStreamingBitrate();

                if (!maxHeight) {
                    maxHeight = qualityoptions.getVideoQualityOptions(bitrateSetting).filter(function (q) {
                        return q.selected;
                    })[0].maxHeight;
                }

                if (AppInfo.isNativeApp && browserInfo.android) {
                    updateDeviceProfileForAndroid(profile);
                }

                profile.MaxStreamingBitrate = bitrateSetting;

                resolve(profile);
            });
        });
    }
};

var AppInfo = {};

(function () {

    function isTouchDevice() {
        return (('ontouchstart' in window)
             || (navigator.MaxTouchPoints > 0)
             || (navigator.msMaxTouchPoints > 0));
    }

    function setAppInfo() {

        if (isTouchDevice()) {
            AppInfo.isTouchPreferred = true;
        }

        var isCordova = Dashboard.isRunningInCordova();

        AppInfo.enableDetailPageChapters = true;
        AppInfo.enableDetailsMenuImages = true;
        AppInfo.enableMovieHomeSuggestions = true;
        AppInfo.enableSearchInTopMenu = true;
        AppInfo.enableHomeFavorites = true;
        AppInfo.enableNowPlayingBar = true;
        AppInfo.enableHomeTabs = true;
        AppInfo.enableNowPlayingPageBottomTabs = true;
        AppInfo.enableAutoSave = browserInfo.mobile;
        AppInfo.enableHashBang = Dashboard.isRunningInCordova();

        AppInfo.enableAppStorePolicy = isCordova;

        var isIOS = browserInfo.ipad || browserInfo.iphone;
        var isAndroid = browserInfo.android;
        var isMobile = browserInfo.mobile;

        if (isIOS) {

            AppInfo.hasLowImageBandwidth = true;

            if (isCordova) {
                //AppInfo.enableSectionTransitions = true;
                AppInfo.enableSearchInTopMenu = false;
                AppInfo.enableHomeFavorites = false;
                AppInfo.enableHomeTabs = false;
                AppInfo.enableNowPlayingPageBottomTabs = false;

                // Disable the now playing bar for the iphone since we already have the now playing tab at the bottom
                if (navigator.userAgent.toString().toLowerCase().indexOf('iphone') != -1) {
                    AppInfo.enableNowPlayingBar = false;
                }

            } else {
                AppInfo.enableDetailPageChapters = false;
                AppInfo.enableDetailsMenuImages = false;
                AppInfo.enableMovieHomeSuggestions = false;
            }
        }

        if (!AppInfo.hasLowImageBandwidth) {
            AppInfo.enableStudioTabs = true;
            AppInfo.enableTvEpisodesTab = true;
        }

        AppInfo.supportsExternalPlayers = true;

        if (isCordova) {
            AppInfo.enableAppLayouts = true;
            AppInfo.supportsExternalPlayerMenu = true;
            AppInfo.isNativeApp = true;

            if (isIOS) {
                AppInfo.supportsExternalPlayers = false;
            }
        }
        else {
            AppInfo.enableSupporterMembership = true;

            if (!isAndroid && !isIOS) {
                AppInfo.enableAppLayouts = true;
            }
        }

        // This doesn't perform well on iOS
        AppInfo.enableHeadRoom = !isIOS;

        // This currently isn't working on android, unfortunately
        AppInfo.supportsFileInput = !(AppInfo.isNativeApp && isAndroid);

        AppInfo.hasPhysicalVolumeButtons = isCordova || isMobile;

        AppInfo.enableBackButton = isIOS && (window.navigator.standalone || AppInfo.isNativeApp);

        AppInfo.supportsSyncPathSetting = isCordova && isAndroid;

        if (isCordova && isIOS) {
            AppInfo.moreIcon = 'more-horiz';
        } else {
            AppInfo.moreIcon = 'more-vert';
        }
    }

    function initializeApiClient(apiClient) {

        if (AppInfo.enableAppStorePolicy) {
            apiClient.getAvailablePlugins = function () {
                return Promise.resolve([]);
            };
            apiClient.getInstalledPlugins = function () {
                return Promise.resolve([]);
            };
        }

        apiClient.getDefaultImageQuality = Dashboard.getDefaultImageQuality;
        apiClient.normalizeImageOptions = Dashboard.normalizeImageOptions;

        Events.off(apiClient, 'websocketmessage', Dashboard.onWebSocketMessageReceived);
        Events.on(apiClient, 'websocketmessage', Dashboard.onWebSocketMessageReceived);

        Events.off(apiClient, 'requestfail', Dashboard.onRequestFail);
        Events.on(apiClient, 'requestfail', Dashboard.onRequestFail);
    }

    function getSyncProfile() {

        return Dashboard.getDeviceProfile(Math.max(screen.height, screen.width));
    }

    function onApiClientCreated(e, newApiClient) {
        initializeApiClient(newApiClient);

        // This is not included in jQuery slim
        if (window.$) {
            $.ajax = newApiClient.ajax;
        }
    }

    function defineConnectionManager(connectionManager) {

        window.ConnectionManager = connectionManager;

        define('connectionManager', [], function () {
            return connectionManager;
        });
    }

    var localApiClient;
    function bindConnectionManagerEvents(connectionManager, events) {

        Events.on(ConnectionManager, 'apiclientcreated', onApiClientCreated);

        connectionManager.currentApiClient = function () {

            if (!localApiClient) {
                var server = connectionManager.getLastUsedServer();
                if (server) {
                    localApiClient = connectionManager.getApiClient(server.Id);
                }
            }
            return localApiClient;
        };

        //events.on(connectionManager, 'apiclientcreated', function (e, newApiClient) {

        //    //$(newApiClient).on("websocketmessage", Dashboard.onWebSocketMessageReceived).on('requestfail', Dashboard.onRequestFail);
        //    newApiClient.normalizeImageOptions = normalizeImageOptions;
        //});

        events.on(connectionManager, 'localusersignedin', function (e, user) {
            localApiClient = connectionManager.getApiClient(user.ServerId);
            window.ApiClient = localApiClient;
        });
    }

    //localStorage.clear();
    function createConnectionManager() {

        return getSyncProfile().then(function (deviceProfile) {

            return new Promise(function (resolve, reject) {

                require(['connectionManagerFactory', 'apphost', 'credentialprovider', 'events'], function (connectionManagerExports, apphost, credentialProvider, events) {

                    window.MediaBrowser = Object.assign(window.MediaBrowser || {}, connectionManagerExports);

                    var credentialProviderInstance = new credentialProvider();

                    apphost.appInfo().then(function (appInfo) {

                        var capabilities = Dashboard.capabilities();
                        capabilities.DeviceProfile = deviceProfile;

                        connectionManager = new MediaBrowser.ConnectionManager(credentialProviderInstance, appInfo.appName, appInfo.appVersion, appInfo.deviceName, appInfo.deviceId, capabilities, window.devicePixelRatio);

                        defineConnectionManager(connectionManager);
                        bindConnectionManagerEvents(connectionManager, events);

                        if (Dashboard.isConnectMode()) {

                            resolve();

                        } else {

                            console.log('loading ApiClient singleton');

                            return getRequirePromise(['apiclient']).then(function (apiClientFactory) {

                                console.log('creating ApiClient singleton');

                                var apiClient = new apiClientFactory(Dashboard.serverAddress(), appInfo.appName, appInfo.appVersion, appInfo.deviceName, appInfo.deviceId, window.devicePixelRatio);
                                apiClient.enableAutomaticNetworking = false;
                                connectionManager.addApiClient(apiClient);
                                require(['css!' + apiClient.getUrl('Branding/Css')]);
                                window.ApiClient = apiClient;
                                localApiClient = apiClient;
                                console.log('loaded ApiClient singleton');
                                resolve();
                            });
                        }
                    });
                });
            });
        });
    }

    function setDocumentClasses(browser) {

        var elem = document.documentElement;

        if (AppInfo.isTouchPreferred) {
            elem.classList.add('touch');
        }

        if (!AppInfo.enableSupporterMembership) {
            elem.classList.add('supporterMembershipDisabled');
        }

        if (AppInfo.isNativeApp) {
            elem.classList.add('nativeApp');
        }

        if (!AppInfo.enableHomeFavorites) {
            elem.classList.add('homeFavoritesDisabled');
        }
    }

    function loadTheme() {

        var name = getParameterByName('theme');
        if (name) {
            require(['themes/' + name + '/theme']);
            return;
        }

        var date = new Date();
        var month = date.getMonth();
        var day = date.getDate();

        if (month == 9 && day >= 30) {
            require(['themes/halloween/theme']);
            return;
        }

        if (month == 11 && day >= 21 && day <= 26) {
            require(['themes/holiday/theme']);
            return;
        }
    }

    function returnFirstDependency(obj) {
        return obj;
    }

    function getBowerPath() {

        var bowerPath = "bower_components";

        // Put the version into the bower path since we can't easily put a query string param on html imports
        // Emby server will handle this
        if (Dashboard.isConnectMode() && !Dashboard.isRunningInCordova()) {
            //bowerPath += window.dashboardVersion;
        }

        return bowerPath;
    }

    function initRequire() {

        var urlArgs = "v=" + (window.dashboardVersion || new Date().getDate());

        var bowerPath = getBowerPath();

        var apiClientBowerPath = bowerPath + "/emby-apiclient";
        var embyWebComponentsBowerPath = bowerPath + '/emby-webcomponents';

        var paths = {
            velocity: bowerPath + "/velocity/velocity.min",
            ironCardList: 'components/ironcardlist/ironcardlist',
            scrollThreshold: 'components/scrollthreshold',
            directorybrowser: 'components/directorybrowser/directorybrowser',
            playlisteditor: 'components/playlisteditor/playlisteditor',
            medialibrarycreator: 'components/medialibrarycreator/medialibrarycreator',
            medialibraryeditor: 'components/medialibraryeditor/medialibraryeditor',
            howler: bowerPath + '/howler.js/howler.min',
            sortable: bowerPath + '/Sortable/Sortable.min',
            isMobile: bowerPath + '/isMobile/isMobile.min',
            headroom: bowerPath + '/headroom.js/dist/headroom.min',
            masonry: bowerPath + '/masonry/dist/masonry.pkgd.min',
            humanedate: 'components/humanedate',
            libraryBrowser: 'scripts/librarybrowser',
            chromecasthelpers: 'components/chromecasthelpers',
            events: apiClientBowerPath + '/events',
            credentialprovider: apiClientBowerPath + '/credentials',
            apiclient: apiClientBowerPath + '/apiclient',
            connectionManagerFactory: bowerPath + '/emby-apiclient/connectionmanager',
            visibleinviewport: embyWebComponentsBowerPath + "/visibleinviewport",
            browserdeviceprofile: embyWebComponentsBowerPath + "/browserdeviceprofile",
            browser: embyWebComponentsBowerPath + "/browser",
            qualityoptions: embyWebComponentsBowerPath + "/qualityoptions",
            connectservice: apiClientBowerPath + '/connectservice',
            hammer: bowerPath + "/hammerjs/hammer.min",
            layoutManager: embyWebComponentsBowerPath + "/layoutmanager",
            pageJs: embyWebComponentsBowerPath + '/page.js/page',
            focusManager: embyWebComponentsBowerPath + "/focusmanager",
            datetime: embyWebComponentsBowerPath + "/datetime",
            globalize: embyWebComponentsBowerPath + "/globalize",
            itemHelper: embyWebComponentsBowerPath + '/itemhelper',
            itemShortcuts: embyWebComponentsBowerPath + "/shortcuts",
            imageLoader: embyWebComponentsBowerPath + "/images/imagehelper",
            serverNotifications: embyWebComponentsBowerPath + '/servernotifications',
            webAnimations: bowerPath + '/web-animations-js/web-animations-next-lite.min'
        };

        if (navigator.webkitPersistentStorage) {
            paths.imageFetcher = embyWebComponentsBowerPath + "/images/persistentimagefetcher";
            paths.imageFetcher = embyWebComponentsBowerPath + "/images/basicimagefetcher";
        } else if (Dashboard.isRunningInCordova()) {
            paths.imageFetcher = 'cordova/imagestore';
        } else {
            paths.imageFetcher = embyWebComponentsBowerPath + "/images/basicimagefetcher";
        }

        paths.hlsjs = bowerPath + "/hls.js/dist/hls.min";

        if (Dashboard.isRunningInCordova()) {
            paths.sharingMenu = "cordova/sharingwidget";
            paths.serverdiscovery = "cordova/serverdiscovery";
            paths.wakeonlan = "cordova/wakeonlan";
            paths.actionsheet = "cordova/actionsheet";
        } else {
            paths.serverdiscovery = apiClientBowerPath + "/serverdiscovery";
            paths.wakeonlan = apiClientBowerPath + "/wakeonlan";

            define("sharingMenu", [embyWebComponentsBowerPath + "/sharing/sharingmenu"], returnFirstDependency);
            define("actionsheet", [embyWebComponentsBowerPath + "/actionsheet/actionsheet"], returnFirstDependency);
        }

        define("libjass", [bowerPath + "/libjass/libjass", "css!" + bowerPath + "/libjass/libjass"], returnFirstDependency);

        define("emby-button", [embyWebComponentsBowerPath + "/emby-button/emby-button"], returnFirstDependency);
        define("alphaPicker", [embyWebComponentsBowerPath + "/alphapicker/alphapicker"], returnFirstDependency);
        define("paper-icon-button-light", [embyWebComponentsBowerPath + "/emby-button/paper-icon-button-light"]);

        define("emby-input", [embyWebComponentsBowerPath + "/emby-input/emby-input"], returnFirstDependency);
        define("emby-select", [embyWebComponentsBowerPath + "/emby-select/emby-select"], returnFirstDependency);
        define("emby-slider", [embyWebComponentsBowerPath + "/emby-slider/emby-slider"], returnFirstDependency);
        define("emby-checkbox", [embyWebComponentsBowerPath + "/emby-checkbox/emby-checkbox"], returnFirstDependency);
        define("emby-textarea", [embyWebComponentsBowerPath + "/emby-textarea/emby-textarea"], returnFirstDependency);
        define("collectionEditor", [embyWebComponentsBowerPath + "/collectioneditor/collectioneditor"], returnFirstDependency);
        define("playlistEditor", [embyWebComponentsBowerPath + "/playlisteditor/playlisteditor"], returnFirstDependency);
        define("recordingCreator", [embyWebComponentsBowerPath + "/recordingcreator/recordingcreator"], returnFirstDependency);
        define("recordingEditor", [embyWebComponentsBowerPath + "/recordingcreator/recordingeditor"], returnFirstDependency);
        define("subtitleEditor", [embyWebComponentsBowerPath + "/subtitleeditor/subtitleeditor"], returnFirstDependency);
        define("mediaInfo", [embyWebComponentsBowerPath + "/mediainfo/mediainfo"], returnFirstDependency);
        define("refreshDialog", [embyWebComponentsBowerPath + "/refreshdialog/refreshdialog"], returnFirstDependency);
        define("backdrop", [embyWebComponentsBowerPath + "/backdrop/backdrop"], returnFirstDependency);
        define("fetchHelper", [embyWebComponentsBowerPath + "/fetchhelper"], returnFirstDependency);

        define("tvguide", [embyWebComponentsBowerPath + "/guide/guide", 'embyRouter'], returnFirstDependency);

        define("viewManager", [embyWebComponentsBowerPath + "/viewmanager/viewmanager"], function (viewManager) {
            window.ViewManager = viewManager;
            viewManager.dispatchPageEvents(true);
            return viewManager;
        });

        // hack for an android test before browserInfo is loaded
        if (Dashboard.isRunningInCordova() && window.MainActivity) {
            define("shell", ["cordova/android/shell"], returnFirstDependency);
        } else {
            define("shell", [embyWebComponentsBowerPath + "/shell"], returnFirstDependency);
        }

        define("sharingmanager", [embyWebComponentsBowerPath + "/sharing/sharingmanager"], returnFirstDependency);

        if (Dashboard.isRunningInCordova()) {
            paths.apphost = "cordova/apphost";
        } else {
            paths.apphost = "components/apphost";
        }

        // hack for an android test before browserInfo is loaded
        if (Dashboard.isRunningInCordova() && window.MainActivity) {
            paths.appStorage = "cordova/android/appstorage";
        } else {
            paths.appStorage = apiClientBowerPath + "/appstorage";
        }

        paths.syncDialog = "scripts/sync";

        var sha1Path = bowerPath + "/cryptojslib/components/sha1-min";
        var md5Path = bowerPath + "/cryptojslib/components/md5-min";
        var shim = {};

        shim[sha1Path] = {
            deps: [bowerPath + "/cryptojslib/components/core-min"]
        };

        shim[md5Path] = {
            deps: [bowerPath + "/cryptojslib/components/core-min"]
        };

        requirejs.config({
            waitSeconds: 0,
            map: {
                '*': {
                    'css': bowerPath + '/emby-webcomponents/require/requirecss',
                    'html': bowerPath + '/emby-webcomponents/require/requirehtml',
                    'text': bowerPath + '/emby-webcomponents/require/requiretext'
                }
            },
            urlArgs: urlArgs,

            paths: paths,
            shim: shim
        });

        define("cryptojs-sha1", [sha1Path]);
        define("cryptojs-md5", [md5Path]);

        // Done
        define("emby-icons", ['webcomponentsjs', "html!" + bowerPath + "/emby-icons/emby-icons.html"]);

        define("paper-spinner", ['webcomponentsjs', "html!" + bowerPath + "/paper-spinner/paper-spinner.html"]);
        define("paper-tabs", ['webcomponentsjs', "html!" + bowerPath + "/paper-tabs/paper-tabs.html"]);
        define("paper-button", ["html!" + bowerPath + "/paper-button/paper-button.html"]);
        define("paper-icon-button", ["html!" + bowerPath + "/paper-icon-button/paper-icon-button.html"]);
        define("paper-radio-group", ["html!" + bowerPath + "/paper-radio-group/paper-radio-group.html"]);
        define("paper-radio-button", ['webcomponentsjs', "html!" + bowerPath + "/paper-radio-button/paper-radio-button.html"]);
        define("paper-toggle-button", ['webcomponentsjs', "html!" + bowerPath + "/paper-toggle-button/paper-toggle-button.html"]);

        define("paper-textarea", ['webcomponentsjs', "html!" + bowerPath + "/paper-input/paper-textarea.html"]);
        define("paper-item", ["html!" + bowerPath + "/paper-item/paper-item.html"]);
        define("paper-checkbox", ["html!" + bowerPath + "/paper-checkbox/paper-checkbox.html"]);
        define("paper-fab", ["emby-icons", "html!" + bowerPath + "/paper-fab/paper-fab.html"]);
        define("paper-progress", ["html!" + bowerPath + "/paper-progress/paper-progress.html"]);
        define("paper-input", ['webcomponentsjs', "html!" + bowerPath + "/paper-input/paper-input.html"]);
        define("paper-icon-item", ['webcomponentsjs', "html!" + bowerPath + "/paper-item/paper-icon-item.html"]);
        define("paper-item-body", ["html!" + bowerPath + "/paper-item/paper-item-body.html"]);

        define("paper-collapse-item", ["html!" + bowerPath + "/paper-collapse-item/paper-collapse-item.html"]);
        define("emby-collapsible", ['webcomponentsjs', "emby-button", "html!" + bowerPath + "/emby-collapsible/emby-collapsible.html"]);

        define("jstree", [bowerPath + "/jstree/dist/jstree", "css!thirdparty/jstree/themes/default/style.min.css"]);

        define("dashboardcss", ['css!css/dashboard']);

        define("jqmbase", ['dashboardcss', 'css!thirdparty/jquerymobile-1.4.5/jquery.mobile.custom.theme.css']);
        define("jqmicons", ['jqmbase', 'css!thirdparty/jquerymobile-1.4.5/jquery.mobile.custom.icons.css']);
        define("jqmtable", ['jqmbase', "thirdparty/jquerymobile-1.4.5/jqm.table", 'css!thirdparty/jquerymobile-1.4.5/jqm.table.css']);

        define("jqmwidget", ['jqmbase', "thirdparty/jquerymobile-1.4.5/jqm.widget"]);

        define("jqmslider", ['jqmbase', "thirdparty/jquerymobile-1.4.5/jqm.slider", 'css!thirdparty/jquerymobile-1.4.5/jqm.slider.css']);

        define("jqmpopup", ['jqmbase', "thirdparty/jquerymobile-1.4.5/jqm.popup", 'css!thirdparty/jquerymobile-1.4.5/jqm.popup.css']);

        define("jqmlistview", ['jqmbase', 'css!thirdparty/jquerymobile-1.4.5/jqm.listview.css']);

        define("jqmcontrolgroup", ['jqmbase', 'css!thirdparty/jquerymobile-1.4.5/jqm.controlgroup.css']);

        define("jqmcollapsible", ['jqmbase', "jqmicons", "thirdparty/jquerymobile-1.4.5/jqm.collapsible", 'css!thirdparty/jquerymobile-1.4.5/jqm.collapsible.css']);

        define("jqmcheckbox", ['jqmbase', "jqmicons", "thirdparty/jquerymobile-1.4.5/jqm.checkbox", 'css!thirdparty/jquerymobile-1.4.5/jqm.checkbox.css']);

        define("jqmpanel", ['jqmbase', "thirdparty/jquerymobile-1.4.5/jqm.panel", 'css!thirdparty/jquerymobile-1.4.5/jqm.panel.css']);

        define("iron-icon-set", ["html!" + bowerPath + "/iron-icon/iron-icon.html", "html!" + bowerPath + "/iron-iconset-svg/iron-iconset-svg.html"]);
        define("slideshow", [embyWebComponentsBowerPath + "/slideshow/slideshow"], returnFirstDependency);

        define('fetch', [bowerPath + '/fetch/fetch']);
        define('objectassign', [embyWebComponentsBowerPath + '/objectassign']);
        define('native-promise-only', [bowerPath + '/native-promise-only/lib/npo.src']);
        define("fingerprintjs2", [bowerPath + '/fingerprintjs2/fingerprint2'], returnFirstDependency);
        define("clearButtonStyle", ['css!' + embyWebComponentsBowerPath + '/clearbutton']);
        define("listView", [embyWebComponentsBowerPath + "/listview/listview"], returnFirstDependency);
        define("listViewStyle", ['css!' + embyWebComponentsBowerPath + "/listview/listview"], returnFirstDependency);

        if ('registerElement' in document && 'content' in document.createElement('template')) {
            define('webcomponentsjs', []);
        } else {
            define('webcomponentsjs', [bowerPath + '/webcomponentsjs/webcomponents-lite.min.js']);
        }

        if (Dashboard.isRunningInCordova()) {
            define('registrationservices', ['cordova/registrationservices'], returnFirstDependency);

        } else {
            define('registrationservices', ['scripts/registrationservices'], returnFirstDependency);
        }

        if (Dashboard.isRunningInCordova()) {
            define("localassetmanager", ["cordova/localassetmanager"]);
            define("fileupload", ["cordova/fileupload"]);
        } else {
            define("localassetmanager", [apiClientBowerPath + "/localassetmanager"]);
            define("fileupload", [apiClientBowerPath + "/fileupload"]);
        }
        define("connectionmanager", [apiClientBowerPath + "/connectionmanager"]);

        define("contentuploader", [apiClientBowerPath + "/sync/contentuploader"]);
        define("serversync", [apiClientBowerPath + "/sync/serversync"]);
        define("multiserversync", [apiClientBowerPath + "/sync/multiserversync"]);
        define("offlineusersync", [apiClientBowerPath + "/sync/offlineusersync"]);
        define("mediasync", [apiClientBowerPath + "/sync/mediasync"]);

        define("swiper", [bowerPath + "/Swiper/dist/js/swiper.min", "css!" + bowerPath + "/Swiper/dist/css/swiper.min"], returnFirstDependency);

        define("toast", [embyWebComponentsBowerPath + "/toast/toast"], returnFirstDependency);
        define("scrollHelper", [embyWebComponentsBowerPath + "/scrollhelper"], returnFirstDependency);

        define("appSettings", [embyWebComponentsBowerPath + "/appsettings"], updateAppSettings);
        define("userSettings", [embyWebComponentsBowerPath + "/usersettings"], returnFirstDependency);

        define("material-icons", ['css!' + embyWebComponentsBowerPath + '/fonts/material-icons/style']);
        define("robotoFont", ['css!' + embyWebComponentsBowerPath + '/fonts/roboto/style']);
        define("opensansFont", ['css!' + embyWebComponentsBowerPath + '/fonts/opensans/style']);
        define("montserratFont", ['css!' + embyWebComponentsBowerPath + '/fonts/montserrat/style']);
        define("scrollStyles", ['css!' + embyWebComponentsBowerPath + '/scrollstyles']);

        define("navdrawer", ['components/navdrawer/navdrawer'], returnFirstDependency);
        define("viewcontainer", ['components/viewcontainer-lite', 'css!' + embyWebComponentsBowerPath + '/viewmanager/viewcontainer-lite'], returnFirstDependency);
        define('queryString', [bowerPath + '/query-string/index'], function () {
            return queryString;
        });

        define("jQuery", [bowerPath + '/jquery/dist/jquery.slim.min'], function () {

            require(['legacy/fnchecked']);
            if (window.ApiClient) {
                jQuery.ajax = ApiClient.ajax;
            }
            return jQuery;
        });

        define("dialogHelper", [embyWebComponentsBowerPath + "/dialoghelper/dialoghelper"], function (dialoghelper) {

            dialoghelper.setOnOpen(onDialogOpen);
            return dialoghelper;
        });

        if (!('registerElement' in document)) {
            //define("registerElement", ['bower_components/webcomponentsjs/CustomElements.min']);
            define("registerElement", ['webcomponentsjs']);
        } else {
            define("registerElement", []);
        }

        // alias
        define("historyManager", [], function () {
            return Emby.Page;
        });

        // mock this for now. not used in this app
        define("inputManager", [], function () {
            return {
                on: function () {
                },
                off: function () {
                }
            };
        });

        // mock this for now. not used in this app
        define("playbackManager", [], function () {
            return {
                isPlayingVideo: function () {
                    return false;
                }
            };
        });

        // mock this for now. not used in this app
        define("skinManager", [], function () {

            return {
                loadUserSkin: function () {

                    Emby.Page.show('/home.html');
                }
            };
        });

        // mock this for now. not used in this app
        define("playbackManager", [], function () {
            return {
            };
        });

        // mock this for now. not used in this app
        define("pluginManager", [], function () {
            return {
            };
        });

        define("connectionManager", [], function () {
            return ConnectionManager;
        });

        define('apiClientResolver', [], function () {
            return function () {
                return window.ApiClient;
            };
        });

        define("embyRouter", [embyWebComponentsBowerPath + '/router'], function (embyRouter) {

            embyRouter.showLocalLogin = function (apiClient, serverId, manualLogin) {
                Dashboard.navigate('login.html?serverid=' + serverId);
            };

            embyRouter.showSelectServer = function () {
                Dashboard.navigate('selectserver.html');
            };

            embyRouter.showWelcome = function () {

                if (Dashboard.isConnectMode()) {
                    Dashboard.navigate('connectlogin.html?mode=welcome');
                } else {
                    Dashboard.navigate('login.html');
                }
            };

            embyRouter.showSettings = function () {
                Dashboard.navigate('mypreferencesmenu.html?userId=' + ApiClient.getCurrentUserId());
            };

            function showItem(item) {
                if (typeof (item) === 'string') {
                    require(['connectionManager'], function (connectionManager) {
                        var apiClient = connectionManager.currentApiClient();
                        apiClient.getItem(apiClient.getCurrentUserId(), item).then(showItem);
                    });
                } else {
                    Dashboard.navigate(LibraryBrowser.getHref(item));
                }
            }

            embyRouter.showItem = showItem;

            return embyRouter;
        });
    }

    function updateAppSettings(appSettings) {

        appSettings.enableExternalPlayers = function (val) {

            if (val != null) {
                appSettings.set('externalplayers', val.toString());
            }

            return appSettings.get('externalplayers') == 'true';
        };

        return appSettings;
    }

    function onDialogOpen(dlg) {
        if (dlg.classList.contains('formDialog')) {
            if (!dlg.classList.contains('background-theme-b')) {
                dlg.classList.add('background-theme-a');
                dlg.classList.add('ui-body-a');
            }
        }
    }

    function initRequireWithBrowser(browser) {

        var bowerPath = getBowerPath();

        var embyWebComponentsBowerPath = bowerPath + '/emby-webcomponents';

        var preferNativeAlerts = browser.mobile || browser.tv || browser.xboxOne;
        // use native alerts if preferred and supported (not supported in opera tv)
        if (preferNativeAlerts && window.alert) {
            define("alert", [embyWebComponentsBowerPath + "/alert/nativealert"], returnFirstDependency);
        } else {
            define("alert", [embyWebComponentsBowerPath + "/alert/alert"], returnFirstDependency);
        }

        if (preferNativeAlerts && window.confirm) {
            define("confirm", [embyWebComponentsBowerPath + "/confirm/nativeconfirm"], returnFirstDependency);
        } else {
            define("confirm", [embyWebComponentsBowerPath + "/confirm/confirm"], returnFirstDependency);
        }

        if (preferNativeAlerts && window.prompt) {
            define("prompt", [embyWebComponentsBowerPath + "/prompt/nativeprompt"], returnFirstDependency);
        } else {
            define("prompt", [embyWebComponentsBowerPath + "/prompt/prompt"], returnFirstDependency);
        }

        if (browser.tv && !browser.animate) {
            define("loading", [embyWebComponentsBowerPath + "/loading/loading-smarttv"], returnFirstDependency);
        } else {
            define("loading", [embyWebComponentsBowerPath + "/loading/loading-lite"], returnFirstDependency);
        }

        define("multi-download", [embyWebComponentsBowerPath + '/multidownload'], returnFirstDependency);

        if (Dashboard.isRunningInCordova() && browser.android) {
            define("fileDownloader", ['cordova/android/filedownloader'], returnFirstDependency);
        } else {
            define("fileDownloader", [embyWebComponentsBowerPath + '/filedownloader'], returnFirstDependency);
        }
    }

    function init() {

        if (Dashboard.isRunningInCordova() && browserInfo.android) {
            define("nativedirectorychooser", ["cordova/android/nativedirectorychooser"]);
        }

        if (Dashboard.isRunningInCordova() && browserInfo.android) {

            if (MainActivity.getChromeVersion() >= 48) {
                define("audiorenderer", ["scripts/htmlmediarenderer"]);
                //define("audiorenderer", ["cordova/android/vlcplayer"]);
            } else {
                window.VlcAudio = true;
                define("audiorenderer", ["cordova/android/vlcplayer"]);
            }
            define("videorenderer", ["cordova/android/vlcplayer"]);
        }
        else if (Dashboard.isRunningInCordova() && browserInfo.safari) {
            define("audiorenderer", ["cordova/audioplayer"]);
            define("videorenderer", ["scripts/htmlmediarenderer"]);
        }
        else {
            define("audiorenderer", ["scripts/htmlmediarenderer"]);
            define("videorenderer", ["scripts/htmlmediarenderer"]);
        }

        if (Dashboard.isRunningInCordova() && browserInfo.android) {
            define("localsync", ["cordova/android/localsync"]);
        }
        else {
            define("localsync", ["scripts/localsync"]);
        }

        define("livetvcss", ['css!css/livetv.css']);
        define("detailtablecss", ['css!css/detailtable.css']);
        define("tileitemcss", ['css!css/tileitem.css']);

        define("buttonenabled", ["legacy/buttonenabled"]);

        var deps = [];
        deps.push('events');

        deps.push('scripts/mediacontroller');

        require(deps, function (events) {

            window.Events = events;

            initAfterDependencies();
        });
    }

    function getRequirePromise(deps) {

        return new Promise(function (resolve, reject) {

            require(deps, resolve);
        });
    }

    function initAfterDependencies() {

        var deps = [];
        deps.push('scripts/extensions');

        if (!window.fetch) {
            deps.push('fetch');
        }

        if (typeof Object.assign != 'function') {
            deps.push('objectassign');
        }

        require(deps, function () {

            createConnectionManager().then(function () {

                console.log('initAfterDependencies promises resolved');
                MediaController.init();

                require(['globalize'], function (globalize) {

                    window.Globalize = globalize;

                    Promise.all([loadCoreDictionary(globalize), loadSharedComponentsDictionary(globalize)]).then(onGlobalizeInit);
                });
            });
        });
    }

    function loadSharedComponentsDictionary(globalize) {

        var baseUrl = 'bower_components/emby-webcomponents/strings/';

        var languages = ['da', 'de', 'en-US', 'es-MX', 'kk', 'nb', 'nl', 'pt-BR', 'pt-PT', 'ru'];

        var translations = languages.map(function (i) {
            return {
                lang: i,
                path: baseUrl + i + '.json'
            };
        });

        globalize.loadStrings({
            name: 'sharedcomponents',
            translations: translations
        });
    }

    function loadCoreDictionary(globalize) {

        var baseUrl = 'strings/';

        var languages = ['ar', 'bg-BG', 'ca', 'cs', 'da', 'de', 'el', 'en-GB', 'en-US', 'es-AR', 'es-MX', 'es', 'fi', 'fr', 'gsw', 'he', 'hr', 'hu', 'id', 'it', 'kk', 'ko', 'ms', 'nb', 'nl', 'pl', 'pt-BR', 'pt-PT', 'ro', 'ru', 'sl-SI', 'sv', 'tr', 'uk', 'vi', 'zh-CN', 'zh-HK', 'zh-TW'];

        var translations = languages.map(function (i) {
            return {
                lang: i,
                path: baseUrl + i + '.json'
            };
        });

        globalize.defaultModule('core');

        return globalize.loadStrings({
            name: 'core',
            translations: translations
        });
    }

    function onGlobalizeInit() {

        document.title = Globalize.translateDocument(document.title, 'core');

        onAppReady();
    }

    function defineRoute(newRoute, dictionary) {

        var baseRoute = Emby.Page.baseUrl();

        var path = newRoute.path;

        path = path.replace(baseRoute, '');

        console.log('Defining route: ' + path);

        newRoute.dictionary = newRoute.dictionary || dictionary || 'core';
        Emby.Page.addRoute(path, newRoute);
    }

    function defineCoreRoutes() {

        console.log('Defining core routes');

        defineRoute({
            path: '/about.html',
            dependencies: [],
            autoFocus: false,
            controller: 'scripts/aboutpage',
            roles: 'admin'
        });

        defineRoute({
            path: '/addplugin.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/appservices.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/autoorganizelog.html',
            dependencies: [],
            roles: 'admin'
        });

        defineRoute({
            path: '/autoorganizesmart.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/autoorganizetv.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/channelitems.html',
            dependencies: [],
            autoFocus: false,
            transition: 'fade'
        });

        defineRoute({
            path: '/channels.html',
            dependencies: [],
            autoFocus: false,
            transition: 'fade'
        });

        defineRoute({
            path: '/channelsettings.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/cinemamodeconfiguration.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/connectlogin.html',
            dependencies: ['emby-button', 'emby-input'],
            autoFocus: false,
            anonymous: true,
            controller: 'scripts/connectlogin'
        });

        defineRoute({
            path: '/dashboard.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/dashboardgeneral.html',
            dependencies: ['emby-collapsible', 'paper-textarea', 'paper-input', 'paper-checkbox'],
            controller: 'scripts/dashboardgeneral',
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/dashboardhosting.html',
            dependencies: ['paper-checkbox', 'emby-input', 'emby-button'],
            autoFocus: false,
            roles: 'admin',
            controller: 'scripts/dashboardhosting'
        });

        defineRoute({
            path: '/device.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/devices.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/devicesupload.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/dlnaprofile.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/dlnaprofiles.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/dlnaserversettings.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/dlnasettings.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/edititemmetadata.html',
            dependencies: [],
            autoFocus: false
        });

        defineRoute({
            path: '/encodingsettings.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/favorites.html',
            dependencies: [],
            autoFocus: false,
            controller: 'scripts/favorites'
        });

        defineRoute({
            path: '/forgotpassword.html',
            dependencies: ['emby-input', 'emby-button'],
            anonymous: true,
            controller: 'scripts/forgotpassword'
        });

        defineRoute({
            path: '/forgotpasswordpin.html',
            dependencies: ['emby-input', 'emby-button'],
            autoFocus: false,
            anonymous: true,
            controller: 'scripts/forgotpasswordpin'
        });

        defineRoute({
            path: '/gamegenres.html',
            dependencies: [],
            autoFocus: false
        });

        defineRoute({
            path: '/games.html',
            dependencies: [],
            autoFocus: false
        });

        defineRoute({
            path: '/gamesrecommended.html',
            dependencies: [],
            autoFocus: false
        });

        defineRoute({
            path: '/gamestudios.html',
            dependencies: [],
            autoFocus: false
        });

        defineRoute({
            path: '/gamesystems.html',
            dependencies: [],
            autoFocus: false
        });

        defineRoute({
            path: '/home.html',
            dependencies: [],
            autoFocus: false,
            controller: 'scripts/indexpage',
            transition: 'fade'
        });

        defineRoute({
            path: '/index.html',
            dependencies: [],
            autoFocus: false,
            isDefaultRoute: true
        });

        defineRoute({
            path: '/itemdetails.html',
            dependencies: ['emby-button', 'tileitemcss', 'scripts/livetvcomponents', 'paper-icon-button-light', 'listViewStyle'],
            controller: 'scripts/itemdetailpage',
            autoFocus: false,
            transition: 'fade'
        });

        defineRoute({
            path: '/itemlist.html',
            dependencies: [],
            autoFocus: false,
            controller: 'scripts/itemlistpage',
            transition: 'fade'
        });

        defineRoute({
            path: '/kids.html',
            dependencies: [],
            autoFocus: false
        });

        defineRoute({
            path: '/library.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/librarydisplay.html',
            dependencies: ['emby-button', 'paper-checkbox'],
            autoFocus: false,
            roles: 'admin',
            controller: 'scripts/librarydisplay'
        });

        defineRoute({
            path: '/librarypathmapping.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/librarysettings.html',
            dependencies: ['emby-collapsible', 'paper-input', 'paper-checkbox', 'emby-button'],
            autoFocus: false,
            roles: 'admin',
            controller: 'scripts/librarysettings'
        });

        defineRoute({
            path: '/livetv.html',
            dependencies: ['emby-button', 'livetvcss'],
            controller: 'scripts/livetvsuggested',
            autoFocus: false,
            transition: 'fade'
        });

        defineRoute({
            path: '/livetvguideprovider.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/livetvitems.html',
            dependencies: [],
            autoFocus: false
        });

        defineRoute({
            path: '/livetvrecordinglist.html',
            dependencies: [],
            autoFocus: false
        });

        defineRoute({
            path: '/livetvseriestimer.html',
            dependencies: [],
            autoFocus: false
        });

        defineRoute({
            path: '/livetvsettings.html',
            dependencies: [],
            autoFocus: false
        });

        defineRoute({
            path: '/livetvstatus.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/livetvtunerprovider-hdhomerun.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/livetvtunerprovider-m3u.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/livetvtunerprovider-satip.html',
            dependencies: ['paper-input', 'paper-checkbox'],
            autoFocus: false,
            roles: 'admin',
            controller: 'scripts/livetvtunerprovider-satip'
        });

        defineRoute({
            path: '/log.html',
            dependencies: ['paper-toggle-button'],
            roles: 'admin',
            controller: 'scripts/logpage'
        });

        defineRoute({
            path: '/login.html',
            dependencies: ['emby-button', 'humanedate', 'emby-input'],
            autoFocus: false,
            anonymous: true,
            controller: 'scripts/loginpage'
        });

        defineRoute({
            path: '/metadata.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/metadataadvanced.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/metadataimages.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/metadatanfo.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/metadatasubtitles.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/movies.html',
            dependencies: ['emby-button'],
            autoFocus: false,
            controller: 'scripts/moviesrecommended',
            transition: 'fade'
        });

        defineRoute({
            path: '/music.html',
            dependencies: [],
            controller: 'scripts/musicrecommended',
            autoFocus: false,
            transition: 'fade'
        });

        defineRoute({
            path: '/mypreferencesdisplay.html',
            dependencies: ['emby-checkbox', 'emby-button', 'emby-select'],
            autoFocus: false,
            transition: 'fade',
            controller: 'scripts/mypreferencesdisplay'
        });

        defineRoute({
            path: '/mypreferenceshome.html',
            dependencies: ['emby-checkbox', 'emby-button'],
            autoFocus: false,
            transition: 'fade',
            controller: 'scripts/mypreferenceshome'
        });

        defineRoute({
            path: '/mypreferenceslanguages.html',
            dependencies: ['emby-button', 'emby-checkbox'],
            autoFocus: false,
            transition: 'fade',
            controller: 'scripts/mypreferenceslanguages'
        });

        defineRoute({
            path: '/mypreferencesmenu.html',
            dependencies: ['emby-button'],
            autoFocus: false,
            transition: 'fade'
        });

        defineRoute({
            path: '/myprofile.html',
            dependencies: ['emby-button', 'emby-collapsible', 'emby-checkbox', 'emby-input'],
            autoFocus: false,
            transition: 'fade',
            controller: 'scripts/myprofile'
        });

        defineRoute({
            path: '/mysync.html',
            dependencies: ['scripts/syncactivity', 'scripts/taskbutton', 'paper-spinner', 'paper-fab', 'emby-button'],
            autoFocus: false,
            transition: 'fade',
            controller: 'scripts/mysync'
        });

        defineRoute({
            path: '/mysyncjob.html',
            dependencies: ['paper-fab', 'paper-item-body', 'paper-icon-item'],
            autoFocus: false,
            transition: 'fade',
            controller: 'scripts/syncjob'
        });

        defineRoute({
            path: '/mysyncsettings.html',
            dependencies: ['emby-checkbox', 'emby-input', 'emby-button', 'paper-icon-button-light'],
            autoFocus: false,
            transition: 'fade',
            controller: 'scripts/mysyncsettings'
        });

        defineRoute({
            path: '/notificationlist.html',
            dependencies: [],
            autoFocus: false
        });

        defineRoute({
            path: '/notificationsetting.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/notificationsettings.html',
            controller: 'scripts/notificationsettings',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/nowplaying.html',
            dependencies: ['paper-icon-button-light', 'emby-slider', 'emby-button', 'emby-input'],
            controller: 'scripts/nowplayingpage',
            autoFocus: false,
            transition: 'fade'
        });

        defineRoute({
            path: '/photos.html',
            dependencies: [],
            autoFocus: false,
            transition: 'fade'
        });

        defineRoute({
            path: '/playbackconfiguration.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/playlists.html',
            dependencies: [],
            autoFocus: false,
            transition: 'fade'
        });

        defineRoute({
            path: '/plugincatalog.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/plugins.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/reports.html',
            dependencies: [],
            autoFocus: false
        });

        defineRoute({
            path: '/scheduledtask.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/scheduledtasks.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/search.html',
            dependencies: [],
            controller: 'scripts/searchpage'
        });

        defineRoute({
            path: '/secondaryitems.html',
            dependencies: [],
            autoFocus: false,
            controller: 'scripts/secondaryitems'
        });

        defineRoute({
            path: '/selectserver.html',
            dependencies: ['listViewStyle', 'emby-button'],
            autoFocus: false,
            anonymous: true,
            controller: 'scripts/selectserver'
        });

        defineRoute({
            path: '/serversecurity.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/shared.html',
            dependencies: [],
            autoFocus: false,
            anonymous: true
        });

        defineRoute({
            path: '/streamingsettings.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/support.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/supporterkey.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/syncactivity.html',
            dependencies: [],
            autoFocus: false
        });

        defineRoute({
            path: '/syncjob.html',
            dependencies: ['paper-fab', 'paper-item-body', 'paper-icon-item'],
            autoFocus: false,
            transition: 'fade',
            controller: 'scripts/syncjob'
        });

        defineRoute({
            path: '/syncsettings.html',
            dependencies: [],
            autoFocus: false
        });

        defineRoute({
            path: '/tv.html',
            dependencies: ['paper-icon-button-light', 'emby-button'],
            autoFocus: false,
            controller: 'scripts/tvrecommended',
            transition: 'fade'
        });

        defineRoute({
            path: '/useredit.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/userlibraryaccess.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/usernew.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/userparentalcontrol.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/userpassword.html',
            dependencies: ['emby-input', 'emby-button', 'emby-checkbox'],
            autoFocus: false,
            controller: 'scripts/userpasswordpage'
        });

        defineRoute({
            path: '/userprofiles.html',
            dependencies: [],
            autoFocus: false,
            roles: 'admin'
        });

        defineRoute({
            path: '/wizardagreement.html',
            dependencies: ['dashboardcss'],
            autoFocus: false,
            anonymous: true
        });

        defineRoute({
            path: '/wizardcomponents.html',
            dependencies: ['dashboardcss', 'emby-button', 'emby-input', 'emby-select'],
            autoFocus: false,
            anonymous: true,
            controller: 'scripts/wizardcomponents'
        });

        defineRoute({
            path: '/wizardfinish.html',
            dependencies: ['emby-button', 'dashboardcss'],
            autoFocus: false,
            anonymous: true,
            controller: 'scripts/wizardfinishpage'
        });

        defineRoute({
            path: '/wizardlibrary.html',
            dependencies: ['dashboardcss'],
            autoFocus: false,
            anonymous: true
        });

        defineRoute({
            path: '/wizardlivetvguide.html',
            dependencies: ['dashboardcss'],
            autoFocus: false,
            anonymous: true
        });

        defineRoute({
            path: '/wizardlivetvtuner.html',
            dependencies: ['dashboardcss'],
            autoFocus: false,
            anonymous: true
        });

        defineRoute({
            path: '/wizardservice.html',
            dependencies: ['dashboardcss'],
            autoFocus: false,
            anonymous: true
        });

        defineRoute({
            path: '/wizardsettings.html',
            dependencies: ['dashboardcss'],
            autoFocus: false,
            anonymous: true
        });

        defineRoute({
            path: '/wizardstart.html',
            dependencies: ['dashboardcss'],
            autoFocus: false,
            anonymous: true
        });

        defineRoute({
            path: '/wizarduser.html',
            dependencies: ['dashboardcss', 'emby-input'],
            autoFocus: false,
            anonymous: true
        });

        defineRoute({
            path: '/configurationpage',
            dependencies: ['jQuery'],
            autoFocus: false,
            enableCache: false,
            enableContentQueryString: true,
            roles: 'admin'
        });

        defineRoute({
            path: '/',
            isDefaultRoute: true,
            autoFocus: false,
            dependencies: []
        });
    }

    function onAppReady() {

        require(['scripts/mediaplayer'], function () {

            MediaPlayer.init();
        });

        console.log('Begin onAppReady');

        var deps = [];

        deps.push('imageLoader');
        deps.push('embyRouter');
        deps.push('layoutManager');

        if (!(AppInfo.isNativeApp && browserInfo.android)) {
            document.documentElement.classList.add('minimumSizeTabs');
        }

        // Do these now to prevent a flash of content
        if (AppInfo.isNativeApp && browserInfo.android) {
            deps.push('css!devices/android/android.css');
        } else if (AppInfo.isNativeApp && browserInfo.safari) {
            deps.push('css!devices/ios/ios.css');
        } else if (AppInfo.isNativeApp && browserInfo.edge) {
            deps.push('css!devices/windowsphone/wp.css');
        }

        loadTheme();

        if (Dashboard.isRunningInCordova()) {
            deps.push('registrationservices');

            deps.push('cordova/back');

            if (browserInfo.android) {
                deps.push('cordova/android/androidcredentials');
                deps.push('cordova/android/links');
            }
        }

        deps.push('scripts/librarylist');
        deps.push('scripts/librarymenu');

        deps.push('css!css/card.css');

        console.log('onAppReady - loading dependencies');

        require(deps, function (imageLoader, pageObjects, layoutManager) {

            console.log('Loaded dependencies in onAppReady');

            window.ImageLoader = imageLoader;

            layoutManager.init();

            window.Emby = {};
            window.Emby.Page = pageObjects;
            window.Emby.TransparencyLevel = pageObjects.TransparencyLevel;
            defineCoreRoutes();
            Emby.Page.start({
                click: true,
                hashbang: AppInfo.enableHashBang
            });

            var postInitDependencies = [];

            postInitDependencies.push('scripts/thememediaplayer');
            postInitDependencies.push('scripts/remotecontrol');
            postInitDependencies.push('css!css/notifications.css');
            postInitDependencies.push('css!css/chromecast.css');
            postInitDependencies.push('scripts/autobackdrops');

            if (Dashboard.isRunningInCordova()) {

                if (browserInfo.android) {
                    postInitDependencies.push('cordova/android/mediasession');
                    postInitDependencies.push('cordova/android/chromecast');

                } else {
                    postInitDependencies.push('cordova/volume');
                }

                if (browserInfo.safari) {

                    postInitDependencies.push('cordova/ios/chromecast');
                    postInitDependencies.push('cordova/ios/orientation');
                    postInitDependencies.push('cordova/ios/remotecontrols');

                    if (Dashboard.capabilities().SupportsSync) {

                        postInitDependencies.push('cordova/ios/backgroundfetch');
                    }
                }

            } else if (browserInfo.chrome) {
                postInitDependencies.push('scripts/chromecast');
            }

            if (AppInfo.enableNowPlayingBar) {
                postInitDependencies.push('scripts/nowplayingbar');
            }

            if (AppInfo.isNativeApp && browserInfo.safari) {

                postInitDependencies.push('cordova/ios/tabbar');
            }

            postInitDependencies.push('components/remotecontrolautoplay');

            // Prefer custom font over Segoe if on desktop windows
            if (!browserInfo.mobile && navigator.userAgent.toLowerCase().indexOf('windows') != -1) {
                //postInitDependencies.push('opensansFont');
                postInitDependencies.push('robotoFont');
            }

            require(postInitDependencies);
            upgradeLayouts();
        });
    }

    function upgradeLayouts() {
        if (!AppInfo.enableAppLayouts && browserInfo.mobile) {
            Dashboard.getPluginSecurityInfo().then(function (info) {
                if (info.IsMBSupporter) {
                    AppInfo.enableAppLayouts = true;
                }
            });
        }
    }

    initRequire();

    function onWebComponentsReady() {

        var initialDependencies = [];

        initialDependencies.push('browser');

        if (!window.Promise) {
            initialDependencies.push('native-promise-only');
        }

        require(initialDependencies, function (browser) {

            initRequireWithBrowser(browser);

            window.browserInfo = browser;

            setAppInfo();
            setDocumentClasses(browser);

            init();
        });
    }

    onWebComponentsReady();
})();

function pageClassOn(eventName, className, fn) {

    document.addEventListener(eventName, function (e) {

        var target = e.target;
        if (target.classList.contains(className)) {
            fn.call(target, e);
        }
    });
}

function pageIdOn(eventName, id, fn) {

    document.addEventListener(eventName, function (e) {

        var target = e.target;
        if (target.id == id) {
            fn.call(target, e);
        }
    });
}

pageClassOn('viewinit', "page", function () {

    var page = this;

    var current = page.getAttribute('data-theme');

    if (!current) {

        var newTheme;

        if (page.classList.contains('libraryPage')) {
            newTheme = 'b';
        } else {
            newTheme = 'a';
        }

        page.setAttribute("data-theme", newTheme);
        current = newTheme;
    }

    page.classList.add("ui-page");
    page.classList.add("ui-page-theme-" + current);
    page.classList.add("ui-body-" + current);

    var contents = page.querySelectorAll("div[data-role='content']");

    for (var i = 0, length = contents.length; i < length; i++) {
        var content = contents[i];
        //var theme = content.getAttribute("theme") || undefined;

        //content.classList.add("ui-content");
        //if (self.options.contentTheme) {
        //    content.classList.add("ui-body-" + (self.options.contentTheme));
        //}
        // Add ARIA role
        content.setAttribute("role", "main");
        content.classList.add("ui-content");
    }
});

pageClassOn('viewshow', "page", function () {

    var page = this;

    var currentTheme = page.classList.contains('ui-page-theme-a') ? 'a' : 'b';
    var docElem = document.documentElement;

    if (currentTheme == 'a') {
        docElem.classList.add('background-theme-a');
        docElem.classList.remove('background-theme-b');
    } else {
        docElem.classList.add('background-theme-b');
        docElem.classList.remove('background-theme-a');
    }

    var apiClient = window.ApiClient;

    Dashboard.ensureHeader(page);

    if (apiClient && apiClient.isLoggedIn() && !apiClient.isWebSocketOpen()) {
        Dashboard.refreshSystemInfoFromServer();
    }

});

window.addEventListener("beforeunload", function () {

    var apiClient = window.ApiClient;

    // Close the connection gracefully when possible
    if (apiClient && apiClient.isWebSocketOpen()) {

        var localActivePlayers = MediaController.getPlayers().filter(function (p) {

            return p.isLocalPlayer && p.isPlaying();
        });

        if (!localActivePlayers.length) {
            console.log('Sending close web socket command');
            apiClient.closeWebSocket();
        }
    }
});

