import Ember from 'ember';

const {
  Component,
  computed,
  observer,
  run: {
    bind
  },
  String: {
    htmlSafe
  },
  assert,
  $
} = Ember;


export default Component.extend({
  url: '',
  upload: false,
  classNames: ['file-picker'],
  classNameBindings: ['multiple:multiple:single'],
  accept: '*',
  multiple: false,
  preview: true,
  dropzone: true,
  progress: true,
  hideFileInput: true,
  readAs: 'readAsFile',
  selectOnClick: true,
  count: 0,
  errors: [],

  progressStyle: computed('progressValue', function() {
    var width = this.get('progressValue') || 0;
    return htmlSafe('width: ' + width + '%;');
  }),

  /**
   * On insert, hideFileInput if setting is true, `hidePreview`, `hideProgress`
   * and bind onChange events to .file-picker__input element.
   */
  didInsertElement: function() {
    if (this.get('hideFileInput')) {
      this.hideInput();
    }
    this.hidePreview();
    this.hideProgress();

    this.$('.file-picker__input').on(
      'change', bind(this, 'onChange')
    );
  },

  /**
   * On destroy, will remove onChange event bindings.
   */
  willDestroyElement: function() {
    this.$('.file-picker__input').off(
      'change', bind(this, 'onChange')
    );
  },

  /**
   * onChange event: if `multiple` is true, fire `filesSelected` action,
   * otherwise fire `fileSelected` - for both, include file(s). Then, if files
   * is valid at all, pass files to `handleFiles`.
   */
  onChange: function(event) {
    var files = event.target.files;
    if (this.get('multiple')) {
      this.sendAction('filesSelected', files);
    } else {
      this.sendAction('fileSelected', files[0]);
    }

    if (files.length) {
      this.handleFiles(files);
    } else {
      this.clearPreview();
    }
  },

  /**
   * Checks with `filesAreValid` function to do just that. If `preview` true
   * then call `updatePreview`. If `multiple` true, read files accordingly and
   * call `fileLoaded` for each file. If not, just read file accordingly.
   * TODO: (opportunity to DRY here).
   * @param files
   */
  handleFiles: function(files) {
    if (typeof(this.filesAreValid) === 'function') {
      if (!this.filesAreValid(files)) {
        return;
      }
    }

    if (this.get('preview')) {
      this.updatePreview(files);
    }

    /**
     * If multiple files, iterate through them and send 'fileLoaded' action for
     * each one.
     */
    if (this.get('multiple')) {
      const filesArray = Array.prototype.slice.call(files);
      if (this.get('upload') && this.get('url')) {
        // upload this shit and attach progress events
        const fd = new FormData();
        filesArray.forEach((file, index) => {
          fd.append(`file[${index}]`, file);
        });
        const component = this;
        Ember.$.ajax({
          url: this.get('url'),
          data: fd,
          processData: false,
          contentType: false,
          type: 'POST',
          xhr() {
            const xhr = Ember.$.ajaxSettings.xhr();
            xhr.upload.onprogress = (event) => {
              var percentage = event.loaded / event.total * 100;
              component.sendAction('onProgress', percentage);
              component.set('progressValue', event.loaded / event.total * 100);
            };
            return xhr;
          },
        }).done((response) => {
          this.sendAction('filesLoaded', response);
        });
      } else {
        filesArray.forEach((file) => {
          if (this.get('readAs') === 'readAsFile') {
            this.sendAction('fileLoaded', file);
          } else {
            this.readFile(file, this.get('readAs')).then((file) => {
              this.sendAction('fileLoaded', file);
            });
          }
        });
      }
    } else {
      if (this.get('upload') && this.get('url')) {
        const component = this;
        const fd = new FormData();
        fd.append('file', files[0]);
        Ember.$.ajax({
          url: this.get('url'),
          data: fd,
          processData: false,
          contentType: false,
          type: 'POST',
          xhr() {
            const xhr = Ember.$.ajaxSettings.xhr();
            xhr.upload.onprogress = (event) => {
              var percentage = event.loaded / event.total * 100;
              component.sendAction('onProgress', percentage);
              component.set('progressValue', event.loaded / event.total * 100);
            };
            return xhr;
          },
        }).done((response) => {
          this.sendAction('fileLoaded', response);
        });
      } else {
        if (this.get('readAs') === 'readAsFile') {
          this.sendAction('fileLoaded', files[0]);
        } else {
          this.readFile(files[0], this.get('readAs'))
          .then((file) => {
            this.sendAction('fileLoaded', file);
          });
        }
      }
    }
  },

  /**
   * Doesn't do anything if `multiple` is true. With a single file it will
   * run `clearPreview`, unhide the progress bar, read file as dataURL and bind
   * the resolving promise to `addPreviewImage`.
   * @param  {Array} files The selected files
   */
  updatePreview: function(files) {
    if (this.get('multiple')) {
      // TODO
    } else {
      this.clearPreview();
      this.$('.file-picker__progress').show();

      this.readFile(files[0], 'readAsDataURL')
        .then(bind(this, 'addPreviewImage'));

      this.$('.file-picker__dropzone').hide();
    }

    this.$('.file-picker__preview').show();
  },

  /**
   * It will just add an `img` tag to where ever; add class 'multiple' or
   * 'single' depending on `multiple` property.
   * @param file
   */
  addPreviewImage: function(file) {
    var image = this.$(
      '<img src="' + file.data + '" class="file-picker__preview__image ' +
      (this.get('multiple') ? 'multiple' : 'single') + '">');

    this.hideProgress();
    this.$('.file-picker__preview').append(image);
  },

  /**
   * Reads a file
   * @param {File} file A file
   * @param {String} readAs One of
   *  - readAsArrayBuffer
   *  - readAsBinaryString
   *  - readAsDataURL
   *  - readAsText
   * @return {Promise}
   */
  readFile: function(file, readAs) {
    const reader = new FileReader();

    assert(
      'readAs method "' + readAs + '" not implemented', (reader[readAs] && readAs !== 'abort')
    );

    return new Ember.RSVP.Promise((resolve, reject) => {
      reader.onload = function(event) {
        resolve({
          name: file.name,
          type: file.type,
          data: event.target.result,
          size: file.size
        });
      };

      reader.onabort = function() {
        reject({
          event: 'onabort'
        });
      };

      reader.onerror = function(error) {
        reject({
          event: 'onerror',
          error: error
        });
      };

      reader.onprogress = Ember.run.bind(this, (event) => {
        var percentage = event.loaded / event.total * 100;
        this.sendAction('onProgress', percentage, file);
        this.set('progressValue', event.loaded / event.total * 100);
      });

      reader[readAs](file);
    });
  },

  hideInput: function() {
    this.$('.file-picker__input').hide();
  },

  hidePreview: function() {
    this.$('.file-picker__preview').hide();
  },

  hideProgress: function() {
    this.$('.file-picker__progress').hide();
  },

  clearPreview: function() {
    this.$('.file-picker__preview').html('');
    this.hidePreview();
    this.$('.file-picker__dropzone').show();

    // reset
    this.set('removePreview', false);
  },

  removePreviewDidChange: observer('removePreview', function() {
    if (this.get('removePreview')) {
      this.clearPreview();
    }
  }),

  /*****************************************************************************
   * DOM Events
   ****************************************************************************/

  click: function(event) {
    if (this.get('selectOnClick') === true) {
      if (!$(event.target).hasClass('file-picker__input')) {
        this.$('.file-picker__input').trigger('click');
      }
    }
  },

  /* Drag'n'Drop events */
  dragOver: function(event) {
    if (event.preventDefault) {
      event.preventDefault();
    }
    event.dataTransfer.dropEffect = 'copy';
  },

  drop: function(event) {
    if (event.preventDefault) {
      event.preventDefault();
    }
    var files = event.dataTransfer.files;

    if (this.get('multiple')) {
      this.sendAction('filesSelected', files);
    } else {
      this.sendAction('fileSelected', files[0]);
    }

    this.handleFiles(event.dataTransfer.files);
    this.set('count', 0);
    this.$().removeClass('over');
  },

  dragEnter: function(event) {
    if (event.preventDefault) {
      event.preventDefault();
    }
    if (!this.get('multiple')) {
      this.clearPreview();
    }
    var count = this.incrementProperty('count');
    if (count === 1) {
      this.$().addClass('over');
    }
  },

  dragLeave: function(event) {
    if (event.preventDefault) {
      event.preventDefault();
    }
    var count = this.decrementProperty('count');
    if (count === 0) {
      this.$().removeClass('over');
    }
  }
});
