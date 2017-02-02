<!-- BEGIN SHOW/HIDE MAIN MENU -->
jQuery('.morph-main-menu-button-wrapper, .morph-main-menu-activator').on('touchstart click', function(e) {
'use strict';
	e.preventDefault();
		if(jQuery('.morph-main-wrapper').hasClass('morph-main-wrapper-active'))
		{		
			/* hide morph slide */
			jQuery('.morph-main-wrapper').removeClass('morph-main-wrapper-active');
			/* hide morph background */
			jQuery('.morph-main-background').removeClass('morph-main-background-active');
			/* hide background overlay */
			jQuery('.morph-background-overlay').removeClass('morph-background-overlay-active');
			/* hide expanded menu button */
			jQuery('.morph-main-menu-button-wrapper').removeClass('morph-menu-active');
			
			/* when menu de-activated, animate main menu items */
			jQuery('.morph-menu-wrapper').removeClass('morph-menu-wrapper-active');
			
			/* hide search field close button */
			jQuery('.morph-search-close-wrapper').removeClass('morph-search-close-wrapper-active');
			/* hide search field */
			jQuery('.morph-search-wrapper').removeClass('morph-search-wrapper-active');
			jQuery('.morph-search-wrapper #searchform #s').blur();
			/* show search button */
			jQuery('.morph-search-button').removeClass('morph-search-button-hidden');
			
			/* hide secondary menu */
			jQuery('.morph-secondary-menu-wrapper').removeClass('morph-secondary-menu-wrapper-active');
			/* secondary menu button inactive state */
			jQuery('.morph-secondary-menu-button').removeClass('morph-secondary-menu-button-active');
		} else {		
			/* show morph slide */
			jQuery('.morph-main-wrapper').addClass('morph-main-wrapper-active');
			/* show morph background */
			jQuery('.morph-main-background').addClass('morph-main-background-active');
			/* show background overlay */
			jQuery('.morph-background-overlay').addClass('morph-background-overlay-active');
			/* hide expanded menu button */
			jQuery('.morph-main-menu-button-wrapper').addClass('morph-menu-active');
			
			/* when menu activated, animate main menu items */
			jQuery('.morph-menu-wrapper').addClass('morph-menu-wrapper-active');
		}
});
<!-- END SHOW/HIDE MAIN MENU -->

<!-- BEGIN SHOW/HIDE SECONDARY MENU -->
jQuery('.morph-secondary-menu-button svg').on('touchstart click', function(e) {
'use strict';
	e.preventDefault();
		if(jQuery('.morph-secondary-menu-wrapper').hasClass('morph-secondary-menu-wrapper-active'))
		{		
			/* hide secondary menu */
			jQuery('.morph-secondary-menu-wrapper').removeClass('morph-secondary-menu-wrapper-active');
			/* secondary menu button inactive state */
			jQuery('.morph-secondary-menu-button').removeClass('morph-secondary-menu-button-active');
		} else {		
			/* show secondary menu */
			jQuery('.morph-secondary-menu-wrapper').addClass('morph-secondary-menu-wrapper-active');
			/* secondary menu button active state */
			jQuery('.morph-secondary-menu-button').addClass('morph-secondary-menu-button-active');
			
			/* hide search field close button */
			jQuery('.morph-search-close-wrapper').removeClass('morph-search-close-wrapper-active');
			/* hide search field */
			jQuery('.morph-search-wrapper').removeClass('morph-search-wrapper-active');
			jQuery('.morph-search-wrapper #searchform #s').blur();
			/* show search button */
			jQuery('.morph-search-button').removeClass('morph-search-button-hidden');
		}
});
<!-- END SHOW/HIDE SECONDARY MENU -->

<!-- BEGIN HIDE MENU WHEN OVERLAY CLICKED/TAPPED -->
jQuery('.morph-background-overlay').on('touchstart click', function(e) {
'use strict';
	e.preventDefault();
		/* hide morph slide */
		jQuery('.morph-main-wrapper').removeClass('morph-main-wrapper-active');
		/* hide morph background */
		jQuery('.morph-main-background').removeClass('morph-main-background-active');
		/* hide background overlay */
		jQuery('.morph-background-overlay').removeClass('morph-background-overlay-active');
		/* hide expanded menu button */
		jQuery('.morph-main-menu-button-wrapper').removeClass('morph-menu-active');
	
		/* hide secondary menu */
		jQuery('.morph-secondary-menu-wrapper').removeClass('morph-secondary-menu-wrapper-active');
		/* secondary menu button inactive state */
		jQuery('.morph-secondary-menu-button').removeClass('morph-secondary-menu-button-active');
		
		/* hide search field close button */
		jQuery('.morph-search-close-wrapper').removeClass('morph-search-close-wrapper-active');
		/* hide search field */
		jQuery('.morph-search-wrapper').removeClass('morph-search-wrapper-active');
		jQuery('.morph-search-wrapper #searchform #s').blur();
		/* show search button */
		jQuery('.morph-search-button').removeClass('morph-search-button-hidden');
		
		/* when menu de-activated, animate main menu items */
		jQuery('.morph-menu-wrapper').removeClass('morph-menu-wrapper-active');		
});
<!-- END HIDE MENU WHEN OVERLAY CLICKED/TAPPED -->