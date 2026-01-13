
module.exports = {
    workspace: {
        workspaceFolders: [],
        getConfiguration: () => ({
            get: () => undefined
        })
    },
    window: {
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn()
    },
    Uri: {
        file: (f) => ({ fsPath: f })
    }
};
