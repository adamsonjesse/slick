function validateLoginForm() {
    var email = document.forms["loginForm"]["email"].value;
    var password = document.forms["loginForm"]["password"].value;

    if (email == null || email == "") {
        throwError("Please enter your email to login.");
        return false;
    }
    else if (password == null || password == "") {
        throwError("Please enter your password.");
        return false;
    }
}

function validateRegistrationForm() {
    var realName = document.forms["registrationForm"]["realName"].value;
    var aliasName = document.forms["registrationForm"]["aliasName"].value;
    var email = document.forms["registrationForm"]["email"].value;
    var password = document.forms["registrationForm"]["password"].value;
    var repeatPassword = document.forms["registrationForm"]["repeatPassword"].value;

    if (realName == null || realName == "") {   
        throwError("Please enter you full real name (First Last)");
        return false;
    }
    else if (aliasName == null || aliasName == "") {
        throwError("Please enter a unique user name");
        return false;
    }
    else if (email == null || email == "") {
        throwError("Please enter a valid email (we will send you a validation code)");
        return false;
    }
    else if (password.length < 6) {
        throwError("Password must be >= 6 characters");
        return false;
    }
    else if (password != repeatPassword) {
        throwError("Passwords don't match");
        return false;
    }
}

function validateVerifyForm() {
    var varificationCode = document.forms["verifyForm"]["verify"].value;

    if (varificationCode == null || varificationCode == "") {   
        throwError("Please enter the verification code in the email we just sent you.");
        return false;
    }
}

function validateResetForm() {
    var email = document.forms["resetForm"]["email"].value;
    if (email == null || email == "") {    
        throwError("Please enter the email of the account you wish to reset.");
        return false;
    }
}

function validateResetVerifyForm() {
    var varificationCode = document.forms["resetVerifyForm"]["verify"].value;
    var password = document.forms["resetVerifyForm"]["password"].value;
    var repeatPassword = document.forms["resetVerifyForm"]["repeatPassword"].value;

    if (varificationCode == null || varificationCode == "") {   
        throwError("Please enter the verification code in the email we just sent you.");
        return false;
    }
    else if (password.length < 6) {
        throwError("Password must be >= 6 characters");
        return false;
    }
    else if (password != repeatPassword) {
        throwError("Passwords don't match");
        return false;
    }
}

function validateChangePasswordForm() {
    var oldPassword = document.forms["changePasswordForm"]["oldPassword"].value;
    var password = document.forms["changePasswordForm"]["password"].value;
    var repeatPassword = document.forms["changePasswordForm"]["repeatPassword"].value;

    if (oldPassword == null || oldPassword == "") {   
        throwError("Please enter your Old Password.");
        return false;
    }
    else if (password.length < 6) {
        throwError("New Password must be >= 6 characters");
        return false;
    }
    else if (password != repeatPassword) {
        throwError("New Password doesn't match Repeated New Password");
        return false;
    }
}

function throwError(errorText) {
    var containerError = document.getElementById('error-message');
    containerError.innerHTML = ''; //Clear Any Current Errors
    var div = document.createElement('div');
    containerError.appendChild(div);
    div.innerHTML = '<p>'+errorText+'</p>';
    div.className = 'alert alert-danger'; //Links to CSS
}